import {
  CanActivate,
  ExceptionFilter,
  HttpServer,
  INestApplication,
  INestMicroservice,
  NestHybridApplicationOptions,
  NestInterceptor,
  PipeTransform,
  VersioningOptions,
  VersioningType,
  WebSocketAdapter,
} from '@nestjs/common';
import {
  GlobalPrefixOptions,
  NestApplicationOptions,
} from '@nestjs/common/interfaces';
import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import {
  addLeadingSlash,
  isFunction,
  isObject,
  isString,
} from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { platform } from 'os';
import { AbstractHttpAdapter } from './adapters';
import { ApplicationConfig } from './application-config';
import { MESSAGES } from './constants';
import { optionalRequire } from './helpers/optional-require';
import { NestContainer } from './injector/container';
import { Injector } from './injector/injector';
import { GraphInspector } from './inspector/graph-inspector';
import { MiddlewareContainer } from './middleware/container';
import { MiddlewareModule } from './middleware/middleware-module';
import { mapToExcludeRoute } from './middleware/utils';
import { NestApplicationContext } from './nest-application-context';
import { Resolver } from './router/interfaces/resolver.interface';
import { RoutesResolver } from './router/routes-resolver';

const { SocketModule } = optionalRequire(
  '@nestjs/websockets/socket-module',
  () => require('@nestjs/websockets/socket-module'),
);
const { MicroservicesModule } = optionalRequire(
  '@nestjs/microservices/microservices-module',
  () => require('@nestjs/microservices/microservices-module'),
);

/**
 * Nest HTTP 应用的运行时实体，是 `NestFactory.create()` 产物的真正实现类。
 *
 * 在 `NestApplicationContext`（上下文/依赖注入能力）的基础上扩展出 HTTP 相关能力：
 * - 生命周期编排：init（初始化）→ listen（监听端口）→ close（关闭）；
 * - 中间件注册（MiddlewareModule）与路由解析（RoutesResolver）；
 * - 全局增强器注册（guards/pipes/interceptors/filters）、CORS、版本控制、
 *   静态资源与视图引擎配置；
 * - 混合应用支持：连接额外的微服务实例（connectMicroservice）。
 *
 * @publicApi
 */
export class NestApplication
  extends NestApplicationContext<NestApplicationOptions>
  implements INestApplication
{
  protected readonly logger = new Logger(NestApplication.name, {
    timestamp: true,
  });
  private readonly middlewareModule: MiddlewareModule;
  private readonly middlewareContainer = new MiddlewareContainer(
    this.container,
  );
  private readonly microservicesModule =
    MicroservicesModule && new MicroservicesModule();
  private readonly socketModule = SocketModule && new SocketModule();
  private readonly routesResolver: Resolver;
  private readonly microservices: any[] = [];
  private httpServer: any;
  private isListening = false;

  /**
   * 构造函数：在父类上下文的基础上初始化 HTTP 应用专属组件。
   *
   * @param container 依赖注入容器（由 NestFactory 创建并完成扫描）
   * @param httpAdapter HTTP 适配器（默认 ExpressAdapter），代理请求/响应周期
   * @param config 应用级配置（全局增强器、全局前缀、版本控制等）
   * @param graphInspector 依赖关系图检查器（snapshot 模式下记录图信息）
   * @param appOptions 应用配置项
   */
  constructor(
    container: NestContainer,
    private readonly httpAdapter: HttpServer,
    private readonly config: ApplicationConfig,
    private readonly graphInspector: GraphInspector,
    appOptions: NestApplicationOptions = {},
  ) {
    super(container, appOptions);

    this.selectContextModule();
    this.registerHttpServer();
    this.injector = new Injector({
      preview: this.appOptions.preview!,
      instanceDecorator: appOptions.instrument?.instanceDecorator,
    });
    this.middlewareModule = new MiddlewareModule();
    this.routesResolver = new RoutesResolver(
      this.container,
      this.config,
      this.injector,
      this.graphInspector,
    );
  }

  /**
   * 释放应用持有的全部资源（close 流程的内部步骤）：
   * 依次关闭 WebSocket 模块、微服务模块、HTTP 适配器，以及所有已连接的微服务实例。
   */
  protected async dispose(): Promise<void> {
    this.socketModule && (await this.socketModule.close());
    this.microservicesModule && (await this.microservicesModule.close());
    this.httpAdapter && (await this.httpAdapter.close());

    await Promise.all(
      iterate(this.microservices).map(async microservice => {
        microservice.setIsTerminated(true);
        await microservice.close();
      }),
    );
  }

  /**
   * 获取 HTTP 适配器实例（如 ExpressAdapter），可用于直接操作底层平台。
   *
   * @returns 当前应用使用的 HTTP 适配器
   */
  public getHttpAdapter(): AbstractHttpAdapter {
    return this.httpAdapter as AbstractHttpAdapter;
  }

  /**
   * 创建并保存底层 HTTP 服务器实例（调用 createServer）。
   */
  public registerHttpServer() {
    this.httpServer = this.createServer();
  }

  /**
   * 获取底层 HTTP 服务器实例（如 Node 的 http.Server）。
   *
   * @returns 底层平台原生 HTTP 服务器
   */
  public getUnderlyingHttpServer<T>(): T {
    return this.httpAdapter.getHttpServer();
  }

  /**
   * 应用启动选项：当前仅处理 CORS 配置——
   * 若 `cors` 为 true 或配置对象/函数，则调用 enableCors 开启跨域支持。
   */
  public applyOptions() {
    if (!this.appOptions || !this.appOptions.cors) {
      return undefined;
    }
    const passCustomOptions =
      isObject(this.appOptions.cors) || isFunction(this.appOptions.cors);
    if (!passCustomOptions) {
      return this.enableCors();
    }
    return this.enableCors(this.appOptions.cors);
  }

  /**
   * 初始化底层 HTTP 服务器：委托适配器创建原生服务器实例并返回。
   *
   * @returns 底层 HTTP 服务器实例
   */
  public createServer<T = any>(): T {
    this.httpAdapter.initHttpServer(this.appOptions);
    return this.httpAdapter.getHttpServer() as T;
  }

  /**
   * 注册模块阶段的准备工作（由 init 调用）：
   * - 注册 WebSocket 模块（若已安装 @nestjs/websockets）；
   * - 注册微服务模块及其客户端（若已安装 @nestjs/microservices）；
   * - 注册中间件（执行用户在 configure() 中定义的中间件绑定）。
   */
  public async registerModules() {
    this.registerWsModule();

    if (this.microservicesModule) {
      this.microservicesModule.register(
        this.container,
        this.graphInspector,
        this.config,
        this.appOptions,
      );
      this.microservicesModule.setupClients(this.container);
    }

    await this.middlewareModule.register(
      this.middlewareContainer,
      this.container,
      this.config,
      this.injector,
      this.httpAdapter,
      this.graphInspector,
      this.appOptions,
    );
  }

  /**
   * 注册 WebSocket 网关模块（仅当 @nestjs/websockets 可用且存在 Gateway 时生效）。
   */
  public registerWsModule() {
    if (!this.socketModule) {
      return;
    }
    this.socketModule.register(
      this.container,
      this.config,
      this.graphInspector,
      this.appOptions,
      this.httpServer,
    );
  }

  /**
   * 初始化 HTTP 应用（生命周期入口，listen 前自动调用）。
   *
   * 执行顺序：
   * 1. 应用启动选项（如 CORS）
   * 2. 初始化 HTTP 适配器
   * 3. 注册请求体解析中间件（body-parser，可通过 bodyParser: false 关闭）
   * 4. 注册模块（WebSocket/微服务/中间件）
   * 5. 注册路由（先注册用户中间件，再解析所有控制器路由）
   * 6. 触发 onModuleInit 生命周期钩子
   * 7. 注册 404/异常兜底处理器
   * 8. 触发 onApplicationBootstrap 生命周期钩子
   *
   * @returns 初始化完成后的应用实例自身
   */
  public async init(): Promise<this> {
    if (this.isInitialized) {
      return this;
    }

    // 1. 应用启动选项（当前仅 CORS）
    this.applyOptions();
    // 2. 初始化 HTTP 适配器
    await this.httpAdapter?.init?.();

    // 3. 默认注册 body-parser 解析中间件（除非 bodyParser: false）
    const useBodyParser =
      this.appOptions && this.appOptions.bodyParser !== false;
    useBodyParser && this.registerParserMiddleware();

    // 4. 注册模块：WebSocket 网关、微服务、用户中间件
    await this.registerModules();
    // 5. 注册路由：先挂载用户中间件，再解析并注册所有控制器路由
    await this.registerRouter();
    // 6. 按模块距离从近到远调用 onModuleInit 钩子
    await this.callInitHook();
    // 7. 注册 404 Not Found 与全局异常兜底处理器
    await this.registerRouterHooks();
    // 8. 按模块距离调用 onApplicationBootstrap 钩子
    await this.callBootstrapHook();

    this.isInitialized = true;
    this.logger.log(MESSAGES.APPLICATION_READY);
    return this;
  }

  /**
   * 注册请求体解析中间件（body-parser）到全局前缀之下。
   */
  public registerParserMiddleware() {
    const prefix = this.config.getGlobalPrefix();
    const rawBody = !!this.appOptions?.rawBody;
    this.httpAdapter.registerParserMiddleware(prefix, rawBody);
  }

  /**
   * 注册路由：
   * 1. 先将中间件容器中登记的中间件注册到 HTTP 实例；
   * 2. 再由 RoutesResolver 遍历所有控制器，将 @Get/@Post 等装饰器
   *    声明的路径解析并绑定到底层 HTTP 服务器。
   */
  public async registerRouter() {
    await this.registerMiddleware(this.httpAdapter);

    const prefix = this.config.getGlobalPrefix();
    const basePath = addLeadingSlash(prefix);
    this.routesResolver.resolve(this.httpAdapter, basePath);
  }

  /**
   * 注册路由兜底钩子：404 处理器（路由未匹配时触发）
   * 与"代理异常过滤器"处理器（请求处理链外抛出的异常由全局过滤器兜底）。
   */
  public async registerRouterHooks() {
    this.routesResolver.registerNotFoundHandler();
    this.routesResolver.registerExceptionHandler();
  }

  /**
   * 连接一个额外的微服务实例，将当前 HTTP 应用变成"混合应用"。
   * 微服务共享同一个依赖注入容器（因此可注入同一批 providers）。
   *
   * @param microserviceOptions 微服务传输层配置（如 TCP/Redis/Kafka 等）
   * @param hybridAppOptions 混合应用选项（如是否继承全局配置、是否延迟初始化）
   * @returns 创建的 NestMicroservice 实例
   */
  public connectMicroservice<T extends object>(
    microserviceOptions: T,
    hybridAppOptions: NestHybridApplicationOptions = {},
  ): INestMicroservice {
    const { NestMicroservice } = loadPackage(
      '@nestjs/microservices',
      'NestFactory',
      () => require('@nestjs/microservices'),
    );
    const { inheritAppConfig } = hybridAppOptions;
    const applicationConfig = inheritAppConfig
      ? this.config
      : new ApplicationConfig();

    const instance = new NestMicroservice(
      this.container,
      microserviceOptions,
      this.graphInspector,
      applicationConfig,
    );

    if (!hybridAppOptions.deferInitialization) {
      instance.registerListeners();
      instance.setIsInitialized(true);
      instance.setIsInitHookCalled(true);
    }

    this.microservices.push(instance);
    return instance;
  }

  /**
   * 获取通过 connectMicroservice 连接的所有微服务实例。
   *
   * @returns 微服务实例列表
   */
  public getMicroservices(): INestMicroservice[] {
    return this.microservices;
  }

  /**
   * 获取底层 HTTP 服务器实例。
   *
   * @returns 原生 HTTP 服务器（如 http.Server）
   */
  public getHttpServer() {
    return this.httpServer;
  }

  /**
   * 启动所有已连接的微服务（并行调用各自的 listen）。
   *
   * @returns 当前应用实例自身
   */
  public async startAllMicroservices(): Promise<this> {
    this.assertNotInPreviewMode('startAllMicroservices');
    await Promise.all(this.microservices.map(msvc => msvc.listen()));
    return this;
  }

  /**
   * 注册中间件函数到底层 HTTP 服务器（等价于 Express 的 app.use），
   * 返回自身以支持链式调用。
   *
   * @param args 中间件函数（或路径 + 中间件函数）
   * @returns 当前应用实例自身
   */
  public use(...args: [any, any?]): this {
    this.httpAdapter.use(...args);
    return this;
  }

  /**
   * 注册指定类型的请求体解析器（body-parser 的便捷封装）。
   * 若当前 HTTP 适配器不支持该能力则打印警告并忽略。
   *
   * @param args 解析器类型（如 'json'/'urlencoded'）及其他参数
   * @returns 当前应用实例自身
   */
  public useBodyParser(...args: [any, any?]): this {
    if (!('useBodyParser' in this.httpAdapter)) {
      this.logger.warn('Your HTTP Adapter does not support `.useBodyParser`.');
      return this;
    }

    const [parserType, ...otherArgs] = args;
    const rawBody = !!this.appOptions.rawBody;

    this.httpAdapter.useBodyParser?.(...[parserType, rawBody, ...otherArgs]);

    return this;
  }

  /**
   * 启用 CORS 跨域支持，委托给底层 HTTP 适配器实现。
   *
   * @param options CORS 配置对象或配置工厂函数
   */
  public enableCors(options?: any): void {
    this.httpAdapter.enableCors(options);
  }

  /**
   * 启用 URI 版本控制（也可通过 options 切换为 Header/Media Type 等类型）。
   *
   * @param options 版本控制配置（默认 URI 类型）
   * @returns 当前应用实例自身
   */
  public enableVersioning(
    options: VersioningOptions = { type: VersioningType.URI },
  ): this {
    this.config.enableVersioning(options);
    return this;
  }

  /**
   * 启动 HTTP 服务器并监听指定端口（应用对外的核心启动方法）。
   * 若尚未初始化会自动执行 init()。
   *
   * @param port 监听端口
   * @param args 可选参数：主机名（hostname）和/或监听成功后的回调函数
   * @returns Promise，解析为底层 HTTP 服务器实例
   */
  public async listen(port: number | string): Promise<any>;
  public async listen(port: number | string, hostname: string): Promise<any>;
  public async listen(port: number | string, ...args: any[]): Promise<any> {
    // 预览模式下禁止真正监听端口
    this.assertNotInPreviewMode('listen');

    // 1. 若未初始化则先执行完整的 init 流程
    if (!this.isInitialized) {
      await this.init();
    }

    // 2. 取出 HttpAdapterHost 引用，用于在监听成功后标记 listening 状态
    const httpAdapterHost = this.container.getHttpAdapterHostRef();
    // 3. 包装成 Promise：监听成功 resolve 服务器实例，出错则 reject
    return new Promise((resolve, reject) => {
      // 一次性错误监听器：监听失败（如端口被占用）时打印日志并 reject
      const errorHandler = (e: any) => {
        this.logger.error(e?.toString?.());
        reject(e);
      };
      this.httpServer.once('error', errorHandler);

      // 4. 若最后一个参数是函数，则视为用户回调，需要从 listen 参数中剥离
      const isCallbackInOriginalArgs = isFunction(args[args.length - 1]);
      const listenFnArgs = isCallbackInOriginalArgs
        ? args.slice(0, args.length - 1)
        : args;

      // 5. 委托适配器真正监听端口，并在内部回调中处理结果
      this.httpAdapter.listen(
        port,
        ...listenFnArgs,
        (...originalCallbackArgs: unknown[]) => {
          // 6. 按配置决定是否立即刷新缓冲的日志
          if (this.appOptions?.autoFlushLogs ?? true) {
            this.flushLogs();
          }
          // 7. 回调首参为 Error 时视为监听失败
          if (originalCallbackArgs[0] instanceof Error) {
            return reject(originalCallbackArgs[0]);
          }

          // 8. 监听成功：读取服务器地址，更新状态并 resolve
          const address = this.httpServer.address();
          if (address) {
            this.httpServer.removeListener('error', errorHandler);
            this.isListening = true;

            httpAdapterHost.listening = true;
            resolve(this.httpServer);
          }
          // 9. 透传用户原始回调（保持与原生 API 兼容）
          if (isCallbackInOriginalArgs) {
            args[args.length - 1](...originalCallbackArgs);
          }
        },
      );
    });
  }

  /**
   * 获取当前应用监听的完整 URL（http:// 或 https:// 开头）。
   * 必须在 listen 成功之后调用，否则抛出错误。
   *
   * @returns Promise，解析为监听地址字符串
   */
  public async getUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isListening) {
        this.logger.error(MESSAGES.CALL_LISTEN_FIRST);
        reject(MESSAGES.CALL_LISTEN_FIRST);
        return;
      }
      const address = this.httpServer.address();
      resolve(this.formatAddress(address));
    });
  }

  /**
   * 将服务器地址对象格式化为完整 URL 字符串：
   * - Unix 域套接字（字符串地址）→ `http+unix://` 形式（Windows 直接返回）；
   * - IPv6 地址用方括号包裹；0.0.0.0 显示为 127.0.0.1。
   *
   * @param address http.Server address() 返回的地址
   * @returns 格式化后的 URL
   */
  private formatAddress(address: any): string {
    if (isString(address)) {
      if (platform() === 'win32') {
        return address;
      }
      const basePath = encodeURIComponent(address);
      return `${this.getProtocol()}+unix://${basePath}`;
    }

    let host = this.host();
    if (address && address.family === 'IPv6') {
      if (host === '::') {
        host = '[::1]';
      } else {
        host = `[${host}]`;
      }
    } else if (host === '0.0.0.0') {
      host = '127.0.0.1';
    }

    return `${this.getProtocol()}://${host}:${address.port}`;
  }

  /**
   * 设置所有路由的全局前缀（如 'api' → /api/xxx），
   * 并可通过 options.exclude 排除部分路由不受前缀影响。
   *
   * @param prefix 全局前缀字符串
   * @param options 前缀配置（如排除路由列表）
   * @returns 当前应用实例自身
   */
  public setGlobalPrefix(prefix: string, options?: GlobalPrefixOptions): this {
    this.config.setGlobalPrefix(prefix);
    if (options) {
      const exclude = options?.exclude
        ? mapToExcludeRoute(options.exclude)
        : [];
      this.config.setGlobalPrefixOptions({
        ...options,
        exclude,
      });
    }
    return this;
  }

  /**
   * 注册自定义 WebSocket 适配器（如 socket.io / ws），供网关使用。
   *
   * @param adapter WebSocket 适配器实例
   * @returns 当前应用实例自身
   */
  public useWebSocketAdapter(adapter: WebSocketAdapter): this {
    this.config.setIoAdapter(adapter);
    return this;
  }

  /**
   * 注册全局异常过滤器（作用于所有控制器/路由）。
   *
   * @param filters 异常过滤器实例列表
   * @returns 当前应用实例自身
   */
  public useGlobalFilters(...filters: ExceptionFilter[]): this {
    filters = this.applyInstanceDecoratorIfRegistered<ExceptionFilter>(
      ...filters,
    );
    this.config.useGlobalFilters(...filters);
    filters.forEach(item =>
      this.graphInspector.insertOrphanedEnhancer({
        subtype: 'filter',
        ref: item,
      }),
    );
    return this;
  }

  /**
   * 注册全局管道（作用于所有路由处理器参数）。
   *
   * @param pipes 管道实例列表
   * @returns 当前应用实例自身
   */
  public useGlobalPipes(...pipes: PipeTransform<any>[]): this {
    pipes = this.applyInstanceDecoratorIfRegistered<PipeTransform<any>>(
      ...pipes,
    );
    this.config.useGlobalPipes(...pipes);
    pipes.forEach(item =>
      this.graphInspector.insertOrphanedEnhancer({
        subtype: 'pipe',
        ref: item,
      }),
    );
    return this;
  }

  /**
   * 注册全局拦截器（作用于所有路由）。
   *
   * @param interceptors 拦截器实例列表
   * @returns 当前应用实例自身
   */
  public useGlobalInterceptors(...interceptors: NestInterceptor[]): this {
    interceptors = this.applyInstanceDecoratorIfRegistered<NestInterceptor>(
      ...interceptors,
    );
    this.config.useGlobalInterceptors(...interceptors);
    interceptors.forEach(item =>
      this.graphInspector.insertOrphanedEnhancer({
        subtype: 'interceptor',
        ref: item,
      }),
    );
    return this;
  }

  /**
   * 注册全局守卫（作用于所有控制器/路由）。
   *
   * @param guards 守卫实例列表
   * @returns 当前应用实例自身
   */
  public useGlobalGuards(...guards: CanActivate[]): this {
    guards = this.applyInstanceDecoratorIfRegistered<CanActivate>(...guards);
    this.config.useGlobalGuards(...guards);
    guards.forEach(item =>
      this.graphInspector.insertOrphanedEnhancer({
        subtype: 'guard',
        ref: item,
      }),
    );
    return this;
  }

  /**
   * 配置静态资源服务（如 Express 的 express.static），
   * 仅当底层适配器支持时生效。
   *
   * @param pathOrOptions 静态资源目录或配置对象
   * @param options 可选的静态资源配置
   * @returns 当前应用实例自身
   */
  public useStaticAssets(options: any): this;
  public useStaticAssets(path: string, options?: any): this;
  public useStaticAssets(pathOrOptions: any, options?: any): this {
    this.httpAdapter.useStaticAssets &&
      this.httpAdapter.useStaticAssets(pathOrOptions, options);
    return this;
  }

  /**
   * 设置服务端模板视图的根目录（仅当适配器支持视图引擎时生效）。
   *
   * @param path 视图目录（单个路径或路径数组）
   * @returns 当前应用实例自身
   */
  public setBaseViewsDir(path: string | string[]): this {
    this.httpAdapter.setBaseViewsDir && this.httpAdapter.setBaseViewsDir(path);
    return this;
  }

  /**
   * 设置服务端渲染使用的视图引擎（如 'pug'、'hbs'）。
   *
   * @param engineOrOptions 视图引擎名称或配置
   * @returns 当前应用实例自身
   */
  public setViewEngine(engineOrOptions: any): this {
    this.httpAdapter.setViewEngine &&
      this.httpAdapter.setViewEngine(engineOrOptions);
    return this;
  }

  /**
   * 从底层 HTTP 服务器地址中提取主机名。
   *
   * @returns 主机名字符串；地址为 Unix 套接字路径时返回 undefined
   */
  private host(): string | undefined {
    const address = this.httpServer.address();
    if (isString(address)) {
      return undefined;
    }
    return address && address.address;
  }

  /**
   * 根据是否配置了 httpsOptions 判断协议类型。
   *
   * @returns 'https' 或 'http'
   */
  private getProtocol(): 'http' | 'https' {
    return this.appOptions && this.appOptions.httpsOptions ? 'https' : 'http';
  }

  /**
   * 将中间件容器中登记的中间件真正注册到 HTTP 实例上（registerRouter 的第一步）。
   *
   * @param instance 目标 HTTP 实例（适配器）
   */
  private async registerMiddleware(instance: any) {
    await this.middlewareModule.registerMiddleware(
      this.middlewareContainer,
      instance,
    );
  }

  /**
   * 若启用了实例装饰器（instrument.instanceDecorator），
   * 则对即将注册的全局增强器实例逐一应用该装饰器（常用于性能分析/埋点）。
   *
   * @param instances 待注册的增强器实例列表
   * @returns 装饰后的实例列表
   */
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
