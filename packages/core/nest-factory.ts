import {
  DynamicModule,
  ForwardReference,
  HttpServer,
  INestApplication,
  INestApplicationContext,
  INestMicroservice,
  Type,
} from '@nestjs/common';
import { NestMicroserviceOptions } from '@nestjs/common/interfaces/microservices/nest-microservice-options.interface';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';
import { ConsoleLogger } from '@nestjs/common/services/console-logger.service';
import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isFunction, isNil } from '@nestjs/common/utils/shared.utils';
import { AbstractHttpAdapter } from './adapters/http-adapter';
import { ApplicationConfig } from './application-config';
import { MESSAGES } from './constants';
import { ExceptionsZone } from './errors/exceptions-zone';
import { loadAdapter } from './helpers/load-adapter';
import { rethrow } from './helpers/rethrow';
import { NestContainer } from './injector/container';
import { Injector } from './injector/injector';
import { InstanceLoader } from './injector/instance-loader';
import { GraphInspector } from './inspector/graph-inspector';
import { NoopGraphInspector } from './inspector/noop-graph-inspector';
import { UuidFactory, UuidFactoryMode } from './inspector/uuid-factory';
import { MetadataScanner } from './metadata-scanner';
import { NestApplication } from './nest-application';
import { NestApplicationContext } from './nest-application-context';
import { DependenciesScanner } from './scanner';

/**
 * 表示 NestFactory 方法接受的入口（根）模块类型。
 *
 * @publicApi
 */
export type IEntryNestModule =
  | Type<any>
  | DynamicModule
  | ForwardReference
  | Promise<IEntryNestModule>;

/**
 * NestFactory 的实现类（单例），封装了所有类型 Nest 应用（HTTP 应用、微服务、
 * 纯上下文应用）的创建与初始化逻辑。
 *
 * 它是整个框架的"总装车间"：负责组装依赖注入容器（NestContainer）、
 * 依赖扫描器（DependenciesScanner）、实例加载器（InstanceLoader）、
 * HTTP 适配器（AbstractHttpAdapter）以及应用实例（NestApplication 等），
 * 是开发者调用 `NestFactory.create()` 时真正执行的代码。
 *
 * @publicApi
 */
export class NestFactoryStatic {
  private readonly logger = new Logger('NestFactory', {
    timestamp: true,
  });
  private abortOnError = true;
  private autoFlushLogs = false;

  /**
   * 创建 NestApplication 实例。
   *
   * @param module 入口（根）应用模块类
   * @param options 初始化 NestApplication 的配置项列表
   *
   * @returns 一个 Promise，解析后包含 NestApplication 实例的引用。
   */
  public async create<T extends INestApplication = INestApplication>(
    module: IEntryNestModule,
    options?: NestApplicationOptions,
  ): Promise<T>;
  /**
   * 使用指定的 `httpAdapter` 创建 NestApplication 实例。
   *
   * @param module 入口（根）应用模块类
   * @param httpAdapter 用于将请求/响应周期代理到底层 HTTP 服务器的适配器
   * @param options 初始化 NestApplication 的配置项列表
   *
   * @returns 一个 Promise，解析后包含 NestApplication 实例的引用。
   */
  public async create<T extends INestApplication = INestApplication>(
    module: IEntryNestModule,
    httpAdapter: AbstractHttpAdapter,
    options?: NestApplicationOptions,
  ): Promise<T>;
  public async create<T extends INestApplication = INestApplication>(
    moduleCls: IEntryNestModule,
    serverOrOptions?: AbstractHttpAdapter | NestApplicationOptions,
    options?: NestApplicationOptions,
  ): Promise<T> {
    const [httpServer, appOptions] = this.isHttpServer(serverOrOptions!)
      ? [serverOrOptions, options]
      : [this.createHttpAdapter(), serverOrOptions];

    // 创建应用配置实例，用于存储全局 pipes、filters、guards、interceptors 等
    const applicationConfig = new ApplicationConfig();
    // 创建依赖注入容器，存储所有模块、providers、controllers 的实例
    const container = new NestContainer(applicationConfig, appOptions);
    // 创建依赖关系图检查器（快照模式下用于序列化和验证依赖关系）
    const graphInspector = this.createGraphInspector(appOptions!, container);

    // 设置错误处理策略（abortOnError）
    this.setAbortOnError(serverOrOptions, options);
    // 配置日志系统
    this.registerLoggerConfiguration(appOptions);

    // 初始化：扫描模块 + 实例化依赖
    await this.initialize(
      moduleCls,
      container,
      graphInspector,
      applicationConfig,
      appOptions,
      httpServer,
    );

    // 创建 NestApplication 实例，整合容器、HTTP 适配器和配置
    const instance = new NestApplication(
      container,
      httpServer,
      applicationConfig,
      graphInspector,
      appOptions,
    );
    // 创建 Nest 实例的代理（用于异常捕获和懒加载）
    const target = this.createNestInstance(instance);
    // 创建适配器代理，将 HTTP 适配器的方法代理到 NestApplication
    return this.createAdapterProxy<T>(target, httpServer);
  }

  /**
   * 创建 NestMicroservice 实例。
   *
   * @param moduleCls 入口（根）应用模块类
   * @param options 可选的微服务配置
   *
   * @returns 一个 Promise，解析后包含 NestMicroservice 实例的引用。
   */
  public async createMicroservice<T extends object>(
    moduleCls: IEntryNestModule,
    options?: NestMicroserviceOptions & T,
  ): Promise<INestMicroservice> {
    const { NestMicroservice } = loadPackage(
      '@nestjs/microservices',
      'NestFactory',
      () => require('@nestjs/microservices'),
    );
    const applicationConfig = new ApplicationConfig();
    const container = new NestContainer(applicationConfig, options);
    const graphInspector = this.createGraphInspector(options!, container);

    this.setAbortOnError(options);
    this.registerLoggerConfiguration(options);

    await this.initialize(
      moduleCls,
      container,
      graphInspector,
      applicationConfig,
      options,
    );
    return this.createNestInstance<INestMicroservice>(
      new NestMicroservice(
        container,
        options,
        graphInspector,
        applicationConfig,
      ),
    );
  }

  /**
   * 创建 NestApplicationContext 实例。
   *
   * @param moduleCls 入口（根）应用模块类
   * @param options 可选的 Nest 应用配置
   *
   * @returns 一个 Promise，解析后包含 NestApplicationContext 实例的引用。
   */
  public async createApplicationContext(
    moduleCls: IEntryNestModule,
    options?: NestApplicationContextOptions,
  ): Promise<INestApplicationContext> {
    const applicationConfig = new ApplicationConfig();
    const container = new NestContainer(applicationConfig, options);
    const graphInspector = this.createGraphInspector(options!, container);

    this.setAbortOnError(options);
    this.registerLoggerConfiguration(options);

    await this.initialize(
      moduleCls,
      container,
      graphInspector,
      applicationConfig,
      options,
    );

    const modules = container.getModules().values();
    const root = modules.next().value;

    const context = this.createNestInstance<NestApplicationContext>(
      new NestApplicationContext(container, options, root),
    );
    if (this.autoFlushLogs) {
      context.flushLogsOnOverride();
    }
    return context.init();
  }

  /**
   * 包装应用实例：为其创建一个异常捕获代理。
   * 之后对实例上所有方法的调用都会经由 `ExceptionsZone` 执行，
   * 保证未捕获异常被统一记录，并根据 abortOnError 策略决定是否终止进程。
   *
   * @param instance 待包装的应用实例
   * @returns 经过 Proxy 包装、具备异常捕获能力的同一实例
   */
  private createNestInstance<T>(instance: T): T {
    return this.createProxy(instance);
  }

  /**
   * 初始化 Nest 应用的核心方法
   *
   * 执行顺序：
   * 1. 设置 UUID 生成模式（确定性/随机）
   * 2. 创建依赖注入所需的核心组件（Injector、InstanceLoader、DependenciesScanner）
   * 3. 设置 HTTP 适配器到容器
   * 4. 扫描模块依赖关系
   * 5. 实例化所有依赖
   * 6. 应用全局提供者（@APP_GUARD、@APP_PIPE 等）
   */
  private async initialize(
    module: any,
    container: NestContainer,
    graphInspector: GraphInspector,
    config = new ApplicationConfig(),
    options: NestApplicationContextOptions = {},
    httpServer: HttpServer | null = null,
  ) {
    // 设置 UUID 生成模式：快照模式用确定性 ID（可复现），其他用随机 ID（支持热重载）
    UuidFactory.mode = options.snapshot
      ? UuidFactoryMode.Deterministic
      : UuidFactoryMode.Random;

    // 创建注入器 - 负责实例化 providers 和解析依赖关系
    const injector = new Injector({
      preview: options.preview!,
      instanceDecorator: options.instrument?.instanceDecorator,
    });
    // 创建实例加载器 - 根据扫描结果实例化所有依赖
    const instanceLoader = new InstanceLoader(
      container,
      injector,
      graphInspector,
    );
    // 创建元数据扫描器 - 扫描模块、controller、provider 上的装饰器
    const metadataScanner = new MetadataScanner();
    // 创建依赖扫描器 - 扫描模块间的导入关系，构建依赖图
    const dependenciesScanner = new DependenciesScanner(
      container,
      metadataScanner,
      graphInspector,
      config,
    );
    // 将 HTTP 适配器注入到容器，供后续路由注册使用
    container.setHttpAdapter(httpServer);

    const teardown = this.abortOnError === false ? rethrow : undefined;
    // 初始化 HTTP 适配器（如 Express）
    await httpServer?.init?.();
    try {
      this.logger.log(MESSAGES.APPLICATION_START);

      // 在异常区域中执行核心初始化逻辑
      await ExceptionsZone.asyncRun(
        async () => {
          // 1. 扫描模块：遍历模块、识别 providers/controllers、构建依赖图
          await dependenciesScanner.scan(module);
          // 2. 实例化依赖：根据依赖图实例化所有 providers 和 controllers
          await instanceLoader.createInstancesOfDependencies();
          // 3. 应用全局提供者：注册 @APP_GUARD、@APP_PIPE、@APP_FILTER、@APP_INTERCEPTOR
          dependenciesScanner.applyApplicationProviders();
        },
        teardown,
        this.autoFlushLogs,
      );
    } catch (e) {
      this.handleInitializationError(e);
    }
  }

  /**
   * 初始化失败时的统一处理：
   * - abortOnError 为 true（默认）时直接 `process.abort()` 终止进程，避免应用处于半初始化状态；
   * - 否则将异常重新抛出，交由调用方处理。
   *
   * @param err 初始化过程中抛出的异常
   */
  private handleInitializationError(err: unknown) {
    if (this.abortOnError) {
      process.abort();
    }
    rethrow(err);
  }

  /**
   * 为目标对象创建 Proxy，拦截其 get/set 操作：
   * 访问到的每个函数属性都会被包装进异常区域（ExceptionsZone）中执行。
   *
   * @param target 待代理的应用实例
   * @returns 包装后的 Proxy 对象
   */
  private createProxy(target: any) {
    const proxy = this.createExceptionProxy();
    return new Proxy(target, {
      get: proxy,
      set: proxy,
    });
  }

  /**
   * 生成 Proxy 的 get/set 拦截器：
   * - 属性不存在时直接返回 undefined；
   * - 属性为函数时返回包裹了 ExceptionsZone 的代理函数；
   * - 普通属性原样返回。
   */
  private createExceptionProxy() {
    return (receiver: Record<string, any>, prop: string) => {
      if (!(prop in receiver)) {
        return;
      }
      if (isFunction(receiver[prop])) {
        return this.createExceptionZone(receiver, prop);
      }
      return receiver[prop];
    };
  }

  /**
   * 将指定对象上的某个方法包装进 `ExceptionsZone.run` 中执行：
   * 方法抛出的异常会被统一记录，随后根据 teardown（abortOnError 策略）
   * 决定终止进程还是重新抛出。
   *
   * @param receiver 方法所属的对象
   * @param prop 方法名
   * @returns 包装后的安全调用函数
   */
  private createExceptionZone(
    receiver: Record<string, any>,
    prop: string,
  ): Function {
    const teardown = this.abortOnError === false ? rethrow : undefined;

    return (...args: unknown[]) => {
      let result: unknown;
      ExceptionsZone.run(
        () => {
          result = receiver[prop](...args);
        },
        teardown,
        this.autoFlushLogs,
      );

      return result;
    };
  }

  /**
   * 根据启动选项配置全局日志系统：
   * - `logger`：覆盖默认日志器（自定义 LoggerService 或日志级别数组）；
   * - `forceConsole`：强制使用 Console 输出（忽略 LogBuffer）；
   * - `bufferLogs`：开启日志缓冲，待应用就绪后统一刷新；
   * - `autoFlushLogs`：记录是否在覆盖日志器后立即刷新缓冲日志。
   *
   * @param options 用户传入的应用配置项
   */
  private registerLoggerConfiguration(
    options: NestApplicationContextOptions | undefined,
  ) {
    if (!options) {
      return;
    }
    const { logger, bufferLogs, autoFlushLogs, forceConsole } = options;
    if ((logger as boolean) !== true && !isNil(logger)) {
      Logger.overrideLogger(logger);
    } else if (forceConsole) {
      // 如果未提供自定义日志器但 forceConsole 为 true，
      // 则创建一个带有 forceConsole 选项的 ConsoleLogger
      const consoleLogger = new ConsoleLogger({ forceConsole: true });
      Logger.overrideLogger(consoleLogger);
    }
    if (bufferLogs) {
      Logger.attachBuffer();
    }
    this.autoFlushLogs = autoFlushLogs ?? true;
  }

  /**
   * 创建默认的 HTTP 适配器。
   * 通过 loadAdapter 懒加载 `@nestjs/platform-express` 包，
   * 若未安装会抛出带安装指引的错误。未显式传入适配器时使用。
   *
   * @param httpServer 可选的已有 HTTP 服务器实例（如 http.Server）
   * @returns Express 适配器实例
   */
  private createHttpAdapter<T = any>(httpServer?: T): AbstractHttpAdapter {
    const { ExpressAdapter } = loadAdapter(
      '@nestjs/platform-express',
      'HTTP',
      () => require('@nestjs/platform-express'),
    );
    return new ExpressAdapter(httpServer);
  }

  /**
   * 判断第二个参数是 HTTP 服务器（适配器）还是配置对象。
   * 通过检测其是否具有 `patch` 方法来区分（适配器必有该方法）。
   *
   * @param serverOrOptions create() 的第二个参数
   * @returns 若为 HTTP 适配器则返回 true（类型守卫）
   */
  private isHttpServer(
    serverOrOptions: AbstractHttpAdapter | NestApplicationOptions,
  ): serverOrOptions is AbstractHttpAdapter {
    return !!(
      serverOrOptions && (serverOrOptions as AbstractHttpAdapter).patch
    );
  }

  /**
   * 解析 abortOnError 错误处理策略：
   * 默认为 true（初始化失败时直接终止进程）；
   * 当用户显式传入 `abortOnError: false` 时改为抛出异常。
   *
   * @param serverOrOptions create() 的第二个参数（可能是适配器）
   * @param options 应用配置项
   */
  private setAbortOnError(
    serverOrOptions?: AbstractHttpAdapter | NestApplicationOptions,
    options?: NestApplicationContextOptions | NestApplicationOptions,
  ) {
    this.abortOnError = this.isHttpServer(serverOrOptions!)
      ? !(options && options.abortOnError === false)
      : !(serverOrOptions && serverOrOptions.abortOnError === false);
  }

  /**
   * 创建"适配器代理"：这是 create() 最终返回给用户的对象。
   * - 优先访问应用实例（NestApplication）自身的属性/方法；
   * - 若属性不存在于应用实例但存在于底层 HTTP 适配器（如 Express 实例），
   *   则将调用转发给适配器，并同样包裹进异常区域执行；
   * - 这使得 `app.get()` 等方法在语义上优先匹配 Nest API，
   *   同时用户仍可像操作 Express 实例一样操作返回值。
   *
   * @param app 包装后的 NestApplication 实例
   * @param adapter 底层 HTTP 适配器
   * @returns 融合了应用与适配器能力的 Proxy 对象
   */
  private createAdapterProxy<T>(app: NestApplication, adapter: HttpServer): T {
    const proxy = new Proxy(app, {
      get: (receiver: Record<string, any>, prop: string) => {
        const mapToProxy = (result: unknown) => {
          return result instanceof Promise
            ? result.then(mapToProxy)
            : result instanceof NestApplication
              ? proxy
              : result;
        };

        if (!(prop in receiver) && prop in adapter) {
          return (...args: unknown[]) => {
            const result = this.createExceptionZone(adapter, prop)(...args);
            return mapToProxy(result);
          };
        }
        if (isFunction(receiver[prop])) {
          return (...args: unknown[]) => {
            const result = receiver[prop](...args);
            return mapToProxy(result);
          };
        }
        return receiver[prop];
      },
    });
    return proxy as unknown as T;
  }

  /**
   * 根据是否开启 snapshot 模式决定使用哪种图检查器：
   * - snapshot 模式使用真实 GraphInspector 记录完整的依赖关系图（用于可视化/分析）；
   * - 普通模式使用 NoopGraphInspector（空实现），避免运行时开销。
   *
   * @param appOptions 应用配置项
   * @param container 依赖注入容器
   * @returns GraphInspector 实例或 NoopGraphInspector
   */
  private createGraphInspector(
    appOptions: NestApplicationContextOptions,
    container: NestContainer,
  ) {
    return appOptions?.snapshot
      ? new GraphInspector(container)
      : NoopGraphInspector;
  }
}

/**
 * 使用 NestFactory 创建应用程序实例。
 *
 * ### 指定入口模块
 *
 * 通过 module 参数传入应用程序所需的*根模块*。
 * 按照惯例，它通常称为 `ApplicationModule`。Nest 从该模块开始，
 * 组装依赖关系图并启动依赖注入过程，
 * 实例化启动应用程序所需的所有类。
 *
 * @publicApi
 */
export const NestFactory = new NestFactoryStatic();
