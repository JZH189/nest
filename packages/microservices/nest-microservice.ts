import {
  CanActivate,
  ExceptionFilter,
  INestMicroservice,
  NestInterceptor,
  PipeTransform,
  WebSocketAdapter,
} from '@nestjs/common';
import { NestMicroserviceOptions } from '@nestjs/common/interfaces/microservices/nest-microservice-options.interface';
import { Logger } from '@nestjs/common/services/logger.service';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { MESSAGES } from '@nestjs/core/constants';
import { optionalRequire } from '@nestjs/core/helpers/optional-require';
import { NestContainer } from '@nestjs/core/injector/container';
import { Injector } from '@nestjs/core/injector/injector';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { NestApplicationContext } from '@nestjs/core/nest-application-context';
import { Transport } from './enums/transport.enum';
import {
  AsyncMicroserviceOptions,
  MicroserviceOptions,
} from './interfaces/microservice-configuration.interface';
import { MicroservicesModule } from './microservices-module';
import { Server } from './server/server';
import { ServerFactory } from './server/server-factory';

const { SocketModule } = optionalRequire(
  '@nestjs/websockets/socket-module',
  () => require('@nestjs/websockets/socket-module'),
);

type CompleteMicroserviceOptions = NestMicroserviceOptions &
  (MicroserviceOptions | AsyncMicroserviceOptions);

/**
 * 微服务应用实例：由 `NestFactory.createMicroservice()` 创建，是微服务的启动入口。
 * 继承自 NestApplicationContext（IoC 容器上下文），并实现 INestMicroservice 接口。
 *
 * 主要职责：
 * 1. 根据配置（transport 或自定义 strategy）通过 ServerFactory 创建底层服务端（Server）；
 * 2. 初始化阶段扫描所有控制器上的 @EventPattern / @MessagePattern，
 *    将消息处理器注册到服务端（见 ListenersController）；
 * 3. 扫描所有实例属性上的 @Client，创建并注入 ClientProxy 客户端；
 * 4. 提供 listen()（启动监听）与 close()（优雅关闭）等生命周期方法。
 */
export class NestMicroservice
  extends NestApplicationContext<NestMicroserviceOptions>
  implements INestMicroservice
{
  protected readonly logger = new Logger(NestMicroservice.name, {
    timestamp: true,
  });
  private readonly microservicesModule = new MicroservicesModule();
  private readonly socketModule = SocketModule ? new SocketModule() : null;
  private microserviceConfig: Exclude<
    CompleteMicroserviceOptions,
    AsyncMicroserviceOptions
  >;
  private serverInstance: Server;
  private isTerminated = false;
  private wasInitHookCalled = false;

  /**
   * Returns an observable that emits status changes.
   */
  get status() {
    return this.serverInstance.status;
  }

  constructor(
    container: NestContainer,
    config: CompleteMicroserviceOptions = {},
    private readonly graphInspector: GraphInspector,
    private readonly applicationConfig: ApplicationConfig,
  ) {
    super(container, config);

    this.injector = new Injector({
      preview: config.preview!,
      instanceDecorator: config.instrument?.instanceDecorator,
    });
    this.microservicesModule.register(
      container,
      this.graphInspector,
      this.applicationConfig,
      this.appOptions,
    );
    this.createServer(config);
    this.selectContextModule();

    const modulesContainer = this.container.getModules();
    modulesContainer.addRpcTarget(this.serverInstance);
  }

  /**
   * 根据传入配置创建底层服务端（Server）实例。
   * 1. 若配置为异步工厂（含 useFactory），先解析注入的依赖并调用工厂得到最终配置；
   * 2. 若配置中显式提供了自定义 strategy，则直接使用该策略作为服务端；
   * 3. 否则通过 ServerFactory 按传输层类型（TCP/Kafka/NATS 等）创建内置服务端。
   * @param config - 微服务配置（同步或异步工厂形式）
   */
  public createServer(config: CompleteMicroserviceOptions) {
    try {
      if ('useFactory' in config) {
        const resolvedConfig = this.resolveAsyncOptions(config);
        this.microserviceConfig = resolvedConfig;

        // Inject custom strategy
        if ('strategy' in resolvedConfig) {
          this.serverInstance = resolvedConfig.strategy as Server;
          return;
        }
      } else {
        this.microserviceConfig = {
          transport: Transport.TCP,
          ...config,
        } as MicroserviceOptions;

        if ('strategy' in config) {
          this.serverInstance = config.strategy as Server;
          return;
        }
      }

      this.serverInstance = ServerFactory.create(
        this.microserviceConfig,
      ) as Server;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * 注册模块：初始化 SocketModule（若安装了 @nestjs/websockets）、
   * 绑定 @Client 客户端、注册消息监听器，并触发 onModuleInit / onApplicationBootstrap 生命周期钩子。
   */
  public async registerModules(): Promise<any> {
    this.socketModule &&
      this.socketModule.register(
        this.container,
        this.applicationConfig,
        this.graphInspector,
        this.appOptions,
      );

    if (!this.appOptions.preview) {
      this.microservicesModule.setupClients(this.container);
      this.registerListeners();
    }

    this.setIsInitialized(true);

    if (!this.wasInitHookCalled) {
      await this.callInitHook();
      await this.callBootstrapHook();
    }
  }

  /**
   * 将所有控制器中的 @EventPattern / @MessagePattern 处理器
   * 绑定到底层服务端实例上（由 MicroservicesModule 遍历各模块的控制器完成）。
   */
  public registerListeners() {
    this.microservicesModule.setupListeners(
      this.container,
      this.serverInstance,
    );
  }

  /**
   * Registers a web socket adapter that will be used for Gateways.
   * Use to override the default `socket.io` library.
   *
   * @param {WebSocketAdapter} adapter
   * @returns {this}
   */
  public useWebSocketAdapter(adapter: WebSocketAdapter): this {
    if (this.isInitialized) {
      this.logger.warn(
        'Cannot apply WebSocket adapter: registration must occur before initialization.',
      );
    }
    this.applicationConfig.setIoAdapter(adapter);
    return this;
  }

  /**
   * Registers global exception filters (will be used for every pattern handler).
   *
   * @param {...ExceptionFilter} filters
   */
  public useGlobalFilters(...filters: ExceptionFilter[]): this {
    if (this.isInitialized) {
      this.logger.warn(
        'Cannot apply global exception filters: registration must occur before initialization.',
      );
    }

    filters = this.applyInstanceDecoratorIfRegistered<ExceptionFilter>(
      ...filters,
    );
    this.applicationConfig.useGlobalFilters(...filters);
    filters.forEach(item =>
      this.graphInspector.insertOrphanedEnhancer({
        subtype: 'filter',
        ref: item,
      }),
    );
    return this;
  }

  /**
   * Registers global pipes (will be used for every pattern handler).
   *
   * @param {...PipeTransform} pipes
   */
  public useGlobalPipes(...pipes: PipeTransform<any>[]): this {
    if (this.isInitialized) {
      this.logger.warn(
        'Global pipes registered after initialization will not be applied.',
      );
    }

    pipes = this.applyInstanceDecoratorIfRegistered<PipeTransform<any>>(
      ...pipes,
    );
    this.applicationConfig.useGlobalPipes(...pipes);
    pipes.forEach(item =>
      this.graphInspector.insertOrphanedEnhancer({
        subtype: 'pipe',
        ref: item,
      }),
    );
    return this;
  }

  /**
   * Registers global interceptors (will be used for every pattern handler).
   *
   * @param {...NestInterceptor} interceptors
   */
  public useGlobalInterceptors(...interceptors: NestInterceptor[]): this {
    if (this.isInitialized) {
      this.logger.warn(
        'Cannot apply global interceptors: registration must occur before initialization.',
      );
    }

    interceptors = this.applyInstanceDecoratorIfRegistered<NestInterceptor>(
      ...interceptors,
    );
    this.applicationConfig.useGlobalInterceptors(...interceptors);
    interceptors.forEach(item =>
      this.graphInspector.insertOrphanedEnhancer({
        subtype: 'interceptor',
        ref: item,
      }),
    );
    return this;
  }

  /**
   * 为微服务注册全局 Guard（对所有消息处理器生效）。
   * @param {...CanActivate} guards - 全局 Guard 实例列表
   */
  public useGlobalGuards(...guards: CanActivate[]): this {
    if (this.isInitialized) {
      this.logger.warn(
        'Cannot apply global guards: registration must occur before initialization.',
      );
    }

    guards = this.applyInstanceDecoratorIfRegistered<CanActivate>(...guards);
    this.applicationConfig.useGlobalGuards(...guards);
    guards.forEach(item =>
      this.graphInspector.insertOrphanedEnhancer({
        subtype: 'guard',
        ref: item,
      }),
    );
    return this;
  }

  /**
   * 初始化应用：先执行父类的初始化（调用模块初始化钩子），再注册模块与监听器。
   * @returns 初始化后的应用实例（this）
   */
  public async init(): Promise<this> {
    if (this.isInitialized) {
      return this;
    }
    await super.init();
    await this.registerModules();
    return this;
  }

  /**
   * Starts the microservice.
   *
   * @returns {void}
   */
  public async listen(): Promise<any> {
    this.assertNotInPreviewMode('listen');
    !this.isInitialized && (await this.registerModules());

    return new Promise<any>((resolve, reject) => {
      this.serverInstance.listen((err, info) => {
        if (this.microserviceConfig?.autoFlushLogs ?? true) {
          this.flushLogs();
        }
        if (err) {
          return reject(err as Error);
        }
        this.logger.log(MESSAGES.MICROSERVICE_READY);
        resolve(info);
      });
    });
  }

  /**
   * Terminates the application.
   *
   * @returns {Promise<void>}
   */
  /**
   * 关闭应用：先关闭底层服务端（断开 broker 连接、停止监听），
   * 再触发应用级关闭流程（销毁所有 provider、调用关闭钩子）。幂等，重复调用无副作用。
   * @returns 关闭完成后的 Promise
   */
  public async close(): Promise<any> {
    await this.serverInstance.close();
    if (this.isTerminated) {
      return;
    }
    this.setIsTerminated(true);
    await this.closeApplication();
  }

  /**
   * Sets the flag indicating that the application is initialized.
   * @param isInitialized Value to set
   */
  public setIsInitialized(isInitialized: boolean) {
    this.isInitialized = isInitialized;
  }

  /**
   * Sets the flag indicating that the application is terminated.
   * @param isTerminated Value to set
   */
  public setIsTerminated(isTerminated: boolean) {
    this.isTerminated = isTerminated;
  }

  /**
   * Sets the flag indicating that the init hook was called.
   * @param isInitHookCalled Value to set
   */
  public setIsInitHookCalled(isInitHookCalled: boolean) {
    this.wasInitHookCalled = isInitHookCalled;
  }

  /**
   * Registers an event listener for the given event.
   * @param event Event name
   * @param callback Callback to be executed when the event is emitted
   */
  public on(event: string | number | symbol, callback: Function) {
    if ('on' in this.serverInstance) {
      return this.serverInstance.on(event as string, callback);
    }
    throw new Error('"on" method not supported by the underlying server');
  }

  /**
   * Returns an instance of the underlying server/broker instance,
   * or a group of servers if there are more than one.
   */
  public unwrap<T>(): T {
    if ('unwrap' in this.serverInstance) {
      return this.serverInstance.unwrap();
    }
    throw new Error('"unwrap" method not supported by the underlying server');
  }

  /**
   * 应用级关闭流程：依次关闭 WebSocket 模块、微服务模块（关闭所有 ClientProxy），
   * 最后调用父类 close() 完成容器销毁与生命周期钩子调用。
   */
  protected async closeApplication(): Promise<any> {
    this.socketModule && (await this.socketModule.close());
    this.microservicesModule && (await this.microservicesModule.close());

    await super.close();
    this.setIsTerminated(true);
  }

  /**
   * 释放资源（在 enableShutdownHooks 的信号处理路径中调用）：
   * 仅关闭服务端与各模块，不走完整的 closeApplication 流程。幂等。
   */
  protected async dispose(): Promise<void> {
    if (this.isTerminated) {
      return;
    }
    await this.serverInstance.close();
    this.socketModule && (await this.socketModule.close());
    this.microservicesModule && (await this.microservicesModule.close());
  }

  /**
   * 解析异步配置：按 inject 声明从容器中获取依赖实例，调用 useFactory 工厂生成最终配置。
   * @param config - 异步微服务配置（含 useFactory / inject）
   * @returns 解析后的同步微服务配置
   */
  protected resolveAsyncOptions(config: AsyncMicroserviceOptions) {
    const args = config.inject?.map(token =>
      this.get(token, { strict: false }),
    );
    return config.useFactory(...args);
  }

  private applyInstanceDecoratorIfRegistered<T>(...instances: T[]): T[] {
    if (this.appOptions.instrument?.instanceDecorator) {
      return instances.map(
        instance =>
          this.appOptions.instrument!.instanceDecorator(instance) as T,
      );
    }
    return instances;
  }
}
