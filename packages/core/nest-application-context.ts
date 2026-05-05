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
   * @returns {void}
   */
  public registerRequestByContextId<T = any>(request: T, contextId: ContextId) {
    this.container.registerRequestProvider(request, contextId);
  }

  /**
   * 初始化 Nest 应用程序。
   * 调用 Nest 生命周期事件。
   *
   * @returns {Promise<this>} 返回 Promise 形式的 NestApplicationContext 实例
   */
  public async init(): Promise<this> {
    if (this.isInitialized) {
      return this;
    }
    /* eslint-disable-next-line no-async-promise-executor */
    this.initializationPromise = new Promise(async (resolve, reject) => {
      try {
        await this.callInitHook();
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
   * 终止应用程序
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

  protected async dispose(): Promise<void> {
    // Nest 应用上下文没有服务器需要释放，因此只执行空操作
    return Promise.resolve();
  }

  /**
   * 通过监听进程事件来监听关闭信号
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
   * 取消订阅关闭信号（进程事件）
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

  protected assertNotInPreviewMode(methodName: string) {
    if (this.appOptions.preview) {
      const error = `Calling the "${methodName}" in the preview mode is not supported.`;
      this.logger.error(error);
      throw new Error(error);
    }
  }

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

  private printInPreviewModeWarning() {
    this.logger.warn('------------------------------------------------');
    this.logger.warn('Application is running in the PREVIEW mode!');
    this.logger.warn('Providers/controllers will not be instantiated.');
    this.logger.warn('------------------------------------------------');
  }
}
