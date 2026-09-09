import {
  INestApplicationContext,
  Logger,
  LoggerService,
  LogLevel,
  ShutdownSignal,
} from '@nestjs/common';
import {
  Abstract,
  DynamicModule,
  GetOrResolveOptions,
  SelectOptions,
  ShutdownHooksOptions,
  Type,
} from '@nestjs/common/interfaces';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { MESSAGES } from './constants';
import { UnknownModuleException } from './errors/exceptions';
import { createContextId } from './helpers/context-id-factory';
import {
  callAppShutdownHook,
  callBeforeAppShutdownHook,
  callModuleBootstrapHook,
  callModuleDestroyHook,
  callModuleInitHook,
} from './hooks';
import { AbstractInstanceResolver } from './injector/abstract-instance-resolver';
import { ModuleCompiler } from './injector/compiler';
import { NestContainer } from './injector/container';
import { Injector } from './injector/injector';
import { InstanceLinksHost } from './injector/instance-links-host';
import { ContextId } from './injector/instance-wrapper';
import { Module } from './injector/module';

/**
 * Nest 应用上下文：NestApplication 的父类，提供"不含 HTTP 服务器"的
 * 依赖注入容器访问与生命周期管理能力。
 *
 * 主要职责：
 * - 实例解析：get / resolve / select（从容器中取出或创建实例）；
 * - 生命周期编排：init → 触发 onModuleInit / onApplicationBootstrap；
 *   close → 触发 onModuleDestroy / beforeApplicationShutdown / onApplicationShutdown；
 * - 优雅停机：enableShutdownHooks 监听系统信号并按相反顺序调用销毁钩子；
 * - 日志管理：useLogger / flushLogs。
 *
 * 可通过 NestFactory.createApplicationContext() 单独创建（无 HTTP 服务器，
 * 适合 CLI、定时任务、消费消息等场景）。
 *
 * @publicApi
 */
export class NestApplicationContext<
  TOptions extends NestApplicationContextOptions =
    NestApplicationContextOptions,
>
  extends AbstractInstanceResolver
  implements INestApplicationContext
{
  protected isInitialized = false;
  protected injector: Injector;
  protected readonly logger = new Logger(NestApplicationContext.name, {
    timestamp: true,
  });

  private shouldFlushLogsOnOverride = false;
  private readonly activeShutdownSignals = new Array<string>();
  private readonly moduleCompiler: ModuleCompiler;
  private shutdownCleanupRef?: (...args: unknown[]) => unknown;
  private _instanceLinksHost: InstanceLinksHost;
  private _moduleRefsForHooksByDistance?: Array<Module>;
  private initializationPromise?: Promise<void>;

  protected get instanceLinksHost() {
    if (!this._instanceLinksHost) {
      this._instanceLinksHost = new InstanceLinksHost(this.container);
    }
    return this._instanceLinksHost;
  }

  /**
   * 构造函数。
   *
   * @param container 依赖注入容器
   * @param appOptions 应用上下文配置项
   * @param contextModule 当前上下文关联的模块（select() 派生的子上下文会指定）
   * @param scope 模块作用域链（从根模块到当前模块的路径，用于错误提示）
   */
  constructor(
    protected readonly container: NestContainer,
    protected readonly appOptions: TOptions = {} as TOptions,
    private contextModule: Module | null = null,
    private readonly scope = new Array<Type<any>>(),
  ) {
    super();
    this.injector = new Injector();
    this.moduleCompiler = container.getModuleCompiler();

    if (this.appOptions.preview) {
      this.printInPreviewModeWarning();
    }
  }

  /**
   * 从容器中选出根模块作为上下文模块（get/resolve 等操作的默认起点）。
   */
  public selectContextModule() {
    const modules = this.container.getModules().values();
    this.contextModule = modules.next().value!;
  }

  /**
   * 允许在模块树中导航，例如，从选定的模块中提取特定实例。
   * @returns {INestApplicationContext}
   */
  public select<T>(
    moduleType: Type<T> | DynamicModule,
    selectOptions?: SelectOptions,
  ): INestApplicationContext {
    const modulesContainer = this.container.getModules();
    const contextModuleCtor = this.contextModule!.metatype;
    const scope = this.scope.concat(contextModuleCtor);

    const moduleTokenFactory = this.container.getModuleTokenFactory();
    const { type, dynamicMetadata } =
      this.moduleCompiler.extractMetadata(moduleType);
    const token = dynamicMetadata
      ? moduleTokenFactory.createForDynamic(
          type,
          dynamicMetadata,
          moduleType as DynamicModule,
        )
      : moduleTokenFactory.createForStatic(type, moduleType as Type);

    const selectedModule = modulesContainer.get(token);
    if (!selectedModule) {
      throw new UnknownModuleException(type.name);
    }

    const options =
      typeof selectOptions?.abortOnError !== 'undefined'
        ? {
            ...this.appOptions,
            ...selectOptions,
          }
        : this.appOptions;

    return new NestApplicationContext(
      this.container,
      options,
      selectedModule,
      scope,
    );
  }

  /**
   * 获取可注入对象或控制器的实例，如果不存在则抛出异常。
   * @returns {TResult}
   */
  public get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
  ): TResult;
  /**
   * 获取可注入对象或控制器的实例，如果不存在则抛出异常。
   * @returns {TResult}
   */
  public get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options: {
      strict?: boolean;
      each?: undefined | false;
    },
  ): TResult;
  /**
   * 获取可注入对象或控制器实例的列表，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  public get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options: {
      strict?: boolean;
      each: true;
    },
  ): Array<TResult>;
  /**
   * 获取可注入对象或控制器的一个实例（或实例列表），如果不存在则抛出异常。
   * @returns {TResult | Array<TResult>}
   */
  public get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Abstract<TInput> | string | symbol,
    options: GetOrResolveOptions = { strict: false },
  ): TResult | Array<TResult> {
    return !(options && options.strict)
      ? this.find<TInput, TResult>(typeOrToken, options)
      : this.find<TInput, TResult>(typeOrToken, {
          moduleId: this.contextModule?.id,
          each: options.each,
        });
  }

  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  public resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
  ): Promise<TResult>;
  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  public resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: {
      id: number;
    },
  ): Promise<TResult>;
  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  public resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: {
      id: number;
    },
    options?: {
      strict?: boolean;
      each?: undefined | false;
    },
  ): Promise<TResult>;
  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  public resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: {
      id: number;
    },
    options?: {
      strict?: boolean;
      each: true;
    },
  ): Promise<Array<TResult>>;
  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例（列表），如果不存在则抛出异常。
   * @returns {Promise<TResult | Array<TResult>>}
   */
  public resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Abstract<TInput> | string | symbol,
    contextId = createContextId(),
    options: GetOrResolveOptions = { strict: false },
  ): Promise<TResult | Array<TResult>> {
    return this.resolvePerContext<TInput, TResult>(
      typeOrToken,
      this.contextModule!,
      contextId,
      options,
    );
  }

  /**
   * 为给定的上下文 ID（DI 容器子树）注册请求/上下文对象。
   * 常用于在请求作用域之外手动注册 REQUEST provider。
   *
   * @param request 请求对象
   * @param contextId 上下文 ID（标识一次请求/上下文）
   * @returns {void}
   */
  public registerRequestByContextId<T = any>(request: T, contextId: ContextId) {
    this.container.registerRequestProvider(request, contextId);
  }

  /**
   * 初始化应用上下文（生命周期入口）。
   *
   * 执行顺序：
   * 1. 按模块距离从近到远触发 onModuleInit 钩子；
   * 2. 触发 onApplicationBootstrap 钩子。
   * 初始化结果被缓存到 initializationPromise，供 close() 等待，
   * 避免重复初始化（isInitialized 幂等保护）。
   *
   * @returns {Promise<this>} 返回 Promise 形式的 NestApplicationContext 实例
   */
  public async init(): Promise<this> {
    if (this.isInitialized) {
      return this;
    }
    // 将初始化过程缓存为 Promise：close() 会先等待它完成，防止销毁早于初始化
    /* eslint-disable-next-line no-async-promise-executor */
    this.initializationPromise = new Promise(async (resolve, reject) => {
      try {
        // 1. 触发 onModuleInit 钩子（按模块距离排序）
        await this.callInitHook();
        // 2. 触发 onApplicationBootstrap 钩子
        await this.callBootstrapHook();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    await this.initializationPromise;

    this.isInitialized = true;
    return this;
  }

  /**
   * 终止应用程序。
   *
   * 执行顺序：
   * 1. 等待初始化 Promise 完成（防止初始化与销毁并发）；
   * 2. 触发 onModuleDestroy 钩子（按模块距离从远到近）；
   * 3. 触发 beforeApplicationShutdown 钩子；
   * 4. 释放资源（dispose，子类负责关闭服务器等）；
   * 5. 触发 onApplicationShutdown 钩子；
   * 6. 取消对系统关闭信号的监听。
   *
   * @param signal 触发关闭的系统信号（如 SIGTERM），可能为空
   * @returns {Promise<void>}
   */
  public async close(signal?: string): Promise<void> {
    await this.initializationPromise;
    await this.callDestroyHook();
    await this.callBeforeShutdownHook(signal);
    await this.dispose();
    await this.callShutdownHook(signal);
    this.unsubscribeFromProcessSignals();
  }

  /**
   * 设置自定义日志服务。
   * 如果自动刷新开启，则刷新缓冲的日志。
   * @returns {void}
   */
  public useLogger(logger: LoggerService | LogLevel[] | false) {
    Logger.overrideLogger(logger);

    if (this.shouldFlushLogsOnOverride) {
      this.flushLogs();
    }
  }

  /**
   * 打印缓冲的日志并分离缓冲区。
   * @returns {void}
   */
  public flushLogs() {
    Logger.flush();
  }

  /**
   * 定义在定义自定义日志器后必须立即刷新日志。
   */
  public flushLogsOnOverride() {
    this.shouldFlushLogsOnOverride = true;
  }

  /**
   * 启用关闭钩子的使用。当进程收到关闭信号时，
   * 将调用提供者的 `onApplicationShutdown` 函数。
   *
   * @param {ShutdownSignal[]} [signals=[]] 应该监听的系统信号
   * @param {ShutdownHooksOptions} [options={}] 配置关闭钩子行为的选项
   *
   * @returns {this} Nest 应用上下文实例
   */
  public enableShutdownHooks(
    signals: (ShutdownSignal | string)[] = [],
    options: ShutdownHooksOptions = {},
  ): this {
    if (isEmpty(signals)) {
      signals = Object.keys(ShutdownSignal).map(
        (key: string) => ShutdownSignal[key],
      );
    } else {
      // 给定的信号数组应该是唯一的，因为进程不应该监听同一个信号超过一次。
      signals = Array.from(new Set(signals));
    }

    signals = iterate(signals)
      .map((signal: string) => signal.toString().toUpperCase().trim())
      // 过滤掉已经在监听的信号
      .filter(signal => !this.activeShutdownSignals.includes(signal))
      .toArray();

    this.listenToShutdownSignals(signals, options);
    return this;
  }

  /**
   * 释放资源（close 流程的内部步骤）。
   * 纯上下文应用没有服务器需要释放，因此只执行空操作；
   * HTTP 应用（NestApplication）会覆写此方法以关闭 WebSocket/微服务/HTTP 服务器。
   */
  protected async dispose(): Promise<void> {
    // Nest 应用上下文没有服务器需要释放，因此只执行空操作
    return Promise.resolve();
  }

  /**
   * 通过监听进程事件来监听关闭信号（enableShutdownHooks 的内部实现）。
   * 收到信号后按顺序执行：销毁钩子 → beforeShutdown 钩子 → dispose →
   * shutdown 钩子，最后将信号转发回进程（或调用 process.exit）以完成正常退出流程。
   *
   * @param {string[]} signals 应该监听的系统信号
   * @param {ShutdownHooksOptions} options 配置关闭钩子行为的选项
   */
  protected listenToShutdownSignals(
    signals: string[],
    options: ShutdownHooksOptions = {},
  ) {
    let receivedSignal = false;
    const cleanup = async (signal: string) => {
      try {
        if (receivedSignal) {
          // 如果在等待服务器停止时收到另一个信号，则忽略它。
          return;
        }
        receivedSignal = true;
        await this.initializationPromise;
        await this.callDestroyHook();
        await this.callBeforeShutdownHook(signal);
        await this.dispose();
        await this.callShutdownHook(signal);
        signals.forEach(sig => process.removeListener(sig, cleanup));

        if (options.useProcessExit) {
          // 使用 process.exit() 确保 'exit' 事件被正确触发。
          // 这对于异步日志记录器（如带有 transports 的 Pino）
          // 在进程终止前刷新缓冲区是必需的。
          process.exit(0);
        } else {
          process.kill(process.pid, signal);
        }
      } catch (err) {
        Logger.error(
          MESSAGES.ERROR_DURING_SHUTDOWN,
          (err as Error)?.stack,
          NestApplicationContext.name,
        );
        process.exit(1);
      }
    };
    this.shutdownCleanupRef = cleanup as (...args: unknown[]) => unknown;

    signals.forEach((signal: string) => {
      this.activeShutdownSignals.push(signal);
      process.on(signal as any, cleanup);
    });
  }

  /**
   * 取消订阅关闭信号（进程事件），
   * 在 close() 完成或重复注册时避免重复触发销毁流程。
   */
  protected unsubscribeFromProcessSignals() {
    if (!this.shutdownCleanupRef) {
      return;
    }
    this.activeShutdownSignals.forEach(signal => {
      process.removeListener(signal, this.shutdownCleanupRef!);
    });
  }

  /**
   * 调用已注册模块及其子模块的 `onModuleInit` 函数。
   */
  protected async callInitHook(): Promise<void> {
    const modulesSortedByDistance = this.getModulesToTriggerHooksOn();
    for (const module of modulesSortedByDistance) {
      await callModuleInitHook(module);
    }
  }

  /**
   * 调用已注册模块及其子模块的 `onModuleDestroy` 函数。
   */
  protected async callDestroyHook(): Promise<void> {
    const modulesSortedByDistance = [
      ...this.getModulesToTriggerHooksOn(),
    ].reverse();

    for (const module of modulesSortedByDistance) {
      await callModuleDestroyHook(module);
    }
  }

  /**
   * 调用已注册模块及其子模块的 `onApplicationBootstrap` 函数。
   */
  protected async callBootstrapHook(): Promise<void> {
    const modulesSortedByDistance = this.getModulesToTriggerHooksOn();
    for (const module of modulesSortedByDistance) {
      await callModuleBootstrapHook(module);
    }
  }

  /**
   * 调用已注册模块及其子模块的 `onApplicationShutdown` 函数。
   */
  protected async callShutdownHook(signal?: string): Promise<void> {
    const modulesSortedByDistance = [
      ...this.getModulesToTriggerHooksOn(),
    ].reverse();

    for (const module of modulesSortedByDistance) {
      await callAppShutdownHook(module, signal);
    }
  }

  /**
   * 调用已注册模块及其子模块的 `beforeApplicationShutdown` 函数。
   */
  protected async callBeforeShutdownHook(signal?: string): Promise<void> {
    const modulesSortedByDistance = [
      ...this.getModulesToTriggerHooksOn(),
    ].reverse();

    for (const module of modulesSortedByDistance) {
      await callBeforeAppShutdownHook(module, signal);
    }
  }

  /**
   * 断言当前不处于预览（preview）模式：预览模式不实例化依赖，
   * 因此 listen/close 等涉及真实运行的方法不可用，调用即抛错。
   *
   * @param methodName 被调用的方法名（用于错误提示）
   */
  protected assertNotInPreviewMode(methodName: string) {
    if (this.appOptions.preview) {
      const error = `Calling the "${methodName}" in the preview mode is not supported.`;
      this.logger.error(error);
      throw new Error(error);
    }
  }

  /**
   * 获取需要触发生命周期钩子的模块列表：
   * - 按模块"距离"（distance，离根模块的层级）从近到远排序，
   *   保证初始化顺序与依赖顺序一致（销毁时取反）；
   * - 结果会被缓存（_moduleRefsForHooksByDistance）；
   * - 预览模式下只保留 initOnPreview 为 true 的模块。
   *
   * @returns 排序后的模块引用数组
   */
  private getModulesToTriggerHooksOn(): Module[] {
    if (this._moduleRefsForHooksByDistance) {
      return this._moduleRefsForHooksByDistance;
    }
    const modulesContainer = this.container.getModules();
    const compareFn = (a: Module, b: Module) => b.distance - a.distance;
    const modulesSortedByDistance = Array.from(modulesContainer.values()).sort(
      compareFn,
    );

    this._moduleRefsForHooksByDistance = this.appOptions?.preview
      ? modulesSortedByDistance.filter(moduleRef => moduleRef.initOnPreview)
      : modulesSortedByDistance;
    return this._moduleRefsForHooksByDistance;
  }

  /**
   * 打印预览模式警告：提示 providers/controllers 不会被实例化。
   */
  private printInPreviewModeWarning() {
    this.logger.warn('------------------------------------------------');
    this.logger.warn('Application is running in the PREVIEW mode!');
    this.logger.warn('Providers/controllers will not be instantiated.');
    this.logger.warn('------------------------------------------------');
  }
}
