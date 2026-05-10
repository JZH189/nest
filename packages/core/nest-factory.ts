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

  private handleInitializationError(err: unknown) {
    if (this.abortOnError) {
      process.abort();
    }
    rethrow(err);
  }

  private createProxy(target: any) {
    const proxy = this.createExceptionProxy();
    return new Proxy(target, {
      get: proxy,
      set: proxy,
    });
  }

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

  private createHttpAdapter<T = any>(httpServer?: T): AbstractHttpAdapter {
    const { ExpressAdapter } = loadAdapter(
      '@nestjs/platform-express',
      'HTTP',
      () => require('@nestjs/platform-express'),
    );
    return new ExpressAdapter(httpServer);
  }

  private isHttpServer(
    serverOrOptions: AbstractHttpAdapter | NestApplicationOptions,
  ): serverOrOptions is AbstractHttpAdapter {
    return !!(
      serverOrOptions && (serverOrOptions as AbstractHttpAdapter).patch
    );
  }

  private setAbortOnError(
    serverOrOptions?: AbstractHttpAdapter | NestApplicationOptions,
    options?: NestApplicationContextOptions | NestApplicationOptions,
  ) {
    this.abortOnError = this.isHttpServer(serverOrOptions!)
      ? !(options && options.abortOnError === false)
      : !(serverOrOptions && serverOrOptions.abortOnError === false);
  }

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
