import { NestApplicationOptions } from '@nestjs/common';
import { InjectionToken } from '@nestjs/common/interfaces';
import { Injectable } from '@nestjs/common/interfaces/injectable.interface';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { GuardsConsumer } from '@nestjs/core/guards/guards-consumer';
import { GuardsContextCreator } from '@nestjs/core/guards/guards-context-creator';
import { loadAdapter } from '@nestjs/core/helpers/load-adapter';
import { NestContainer } from '@nestjs/core/injector/container';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { InterceptorsConsumer } from '@nestjs/core/interceptors/interceptors-consumer';
import { InterceptorsContextCreator } from '@nestjs/core/interceptors/interceptors-context-creator';
import { PipesConsumer } from '@nestjs/core/pipes/pipes-consumer';
import { PipesContextCreator } from '@nestjs/core/pipes/pipes-context-creator';
import { iterate } from 'iterare';
import { AbstractWsAdapter } from './adapters';
import { GATEWAY_METADATA } from './constants';
import { ExceptionFiltersContext } from './context/exception-filters-context';
import { WsContextCreator } from './context/ws-context-creator';
import { WsProxy } from './context/ws-proxy';
import { NestGateway } from './interfaces/nest-gateway.interface';
import { SocketServerProvider } from './socket-server-provider';
import { SocketsContainer } from './sockets-container';
import { WebSocketsController } from './web-sockets-controller';

/**
 * WebSocket 模块：@nestjs/websockets 包的核心入口之一。
 *
 * 在 Nest 应用启动时（由 NestApplication 调用 register）被激活，其职责包括：
 * 1. 初始化 WebSocket 适配器（IoAdapter，默认为 socket.io 适配器，可被用户自定义覆盖）；
 * 2. 遍历容器中所有模块的 provider，识别带有 @WebSocketGateway 装饰器（GATEWAY_METADATA）
 *    的网关类，并交给 WebSocketsController 完成服务器的创建与方法订阅；
 * 3. 在应用关闭时（close）统一关闭所有 WebSocket 服务器并清理容器。
 *
 * @typeParam THttpServer - 底层 HTTP 服务器的类型（WebSocket 服务器通常挂载其上）。
 * @typeParam TAppOptions - 应用选项类型（如 NestApplicationContextOptions / NestApplicationOptions）。
 */
export class SocketModule<
  THttpServer = any,
  TAppOptions extends NestApplicationContextOptions =
    NestApplicationContextOptions,
> {
  /** 所有已注册 WebSocket 服务器的容器（按 moduleKey + namespace + port 分组存储）。 */
  private readonly socketsContainer = new SocketsContainer();
  /** 应用配置，持有全局 IoAdapter 等信息。 */
  private applicationConfig: ApplicationConfig;
  /** WebSocket 控制器，负责真正创建服务器并订阅网关的消息处理方法。 */
  private webSocketsController: WebSocketsController;
  /** 标记适配器是否已经初始化，避免重复初始化。 */
  private isAdapterInitialized: boolean;
  /** 底层 HTTP 服务器引用（若有），WebSocket 服务器可复用它。 */
  private httpServer: THttpServer | undefined;
  /** 应用启动选项（例如 forceCloseConnections）。 */
  private appOptions: TAppOptions;

  /**
   * 注册 WebSocket 模块：构建内部协作对象，并扫描全部模块以连接网关。
   *
   * 处理步骤：
   * 1. 保存应用配置、启动选项与 HTTP 服务器引用；
   * 2. 创建 WsContextCreator（负责为消息处理方法构造执行上下文：管道、守卫、拦截器、异常过滤器）；
   * 3. 创建 SocketServerProvider 与 WebSocketsController；
   * 4. 遍历依赖注入容器中的所有模块，对每个模块的 provider 执行 connectAllGateways。
   *
   * @param container - Nest 依赖注入容器（NestContainer），用于读取所有模块与 provider。
   * @param applicationConfig - 全局应用配置（含 IoAdapter）。
   * @param graphInspector - 依赖图检查器，用于向开发者工具暴露网关信息。
   * @param appOptions - 应用启动选项。
   * @param httpServer - 可选的底层 HTTP 服务器，WebSocket 服务器可基于它复用端口。
   * @returns 无返回值（副作用：完成网关扫描与适配器初始化的准备）。
   */
  public register(
    container: NestContainer,
    applicationConfig: ApplicationConfig,
    graphInspector: GraphInspector,
    appOptions: TAppOptions,
    httpServer?: THttpServer,
  ) {
    this.applicationConfig = applicationConfig;
    this.appOptions = appOptions;
    this.httpServer = httpServer;

    const contextCreator = this.getContextCreator(container);
    const serverProvider = new SocketServerProvider(
      this.socketsContainer,
      applicationConfig,
    );
    this.webSocketsController = new WebSocketsController(
      serverProvider,
      applicationConfig,
      contextCreator,
      graphInspector,
      this.appOptions,
    );
    const modules = container.getModules();
    modules.forEach(({ providers }, moduleName: string) =>
      this.connectAllGateways(providers, moduleName),
    );
  }

  /**
   * 遍历指定模块的所有 provider，将其中符合条件的网关类连接到服务器。
   *
   * 处理步骤：
   * 1. 使用 iterare 迭代所有 provider 的 InstanceWrapper；
   * 2. 过滤掉空包装以及尚未注册元类型（metatype）的包装；
   * 3. 对每个有效 provider 调用 connectGatewayToServer 尝试建立网关连接。
   *
   * @param providers - 某个模块中的 provider 集合（InjectionToken -> InstanceWrapper 映射）。
   * @param moduleName - 当前模块的名称，用于日志与服务器分组。
   * @returns 无返回值。
   */
  public connectAllGateways(
    providers: Map<InjectionToken, InstanceWrapper<Injectable>>,
    moduleName: string,
  ) {
    iterate(providers.values())
      .filter(wrapper => wrapper && !wrapper.isNotMetatype)
      .forEach(wrapper => this.connectGatewayToServer(wrapper, moduleName));
  }

  /**
   * 判断给定 provider 是否为 WebSocket 网关，若是则将其接入 WebSocketsController。
   *
   * 处理步骤：
   * 1. 读取 provider 元类型上的全部元数据键；
   * 2. 若不包含 GATEWAY_METADATA（即未被 @WebSocketGateway 装饰），直接返回；
   * 3. 若适配器尚未初始化，则先调用 initializeAdapter 完成初始化；
   * 4. 委托 WebSocketsController.connectGatewayToServer 完成服务器创建与方法订阅。
   *
   * @param wrapper - provider 的实例包装器，包含实例与元类型。
   * @param moduleName - provider 所在模块的名称。
   * @returns 无返回值（非网关时静默跳过）。
   */
  public connectGatewayToServer(
    wrapper: InstanceWrapper<Injectable>,
    moduleName: string,
  ) {
    const { instance, metatype } = wrapper;
    const metadataKeys = Reflect.getMetadataKeys(metatype!);
    if (!metadataKeys.includes(GATEWAY_METADATA)) {
      return;
    }
    if (!this.isAdapterInitialized) {
      this.initializeAdapter();
    }
    this.webSocketsController.connectGatewayToServer(
      instance as NestGateway,
      metatype!,
      moduleName,
      wrapper.id,
    );
  }

  /**
   * 关闭所有已注册的 WebSocket 服务器并清理资源。
   *
   * 处理步骤：
   * 1. 若应用配置尚未初始化（从未调用过 register），直接返回；
   * 2. 若不存在 IoAdapter，直接返回；
   * 3. 从容器中取出所有服务器，对每个有效服务器调用 adapter.close 关闭；
   * 4. 调用适配器的 dispose 方法（若支持，AbstractWsAdapter）释放适配器级资源；
   * 5. 清空服务器容器。
   *
   * @returns 当全部服务器关闭完成后解析的 Promise。
   */
  public async close(): Promise<any> {
    if (!this.applicationConfig) {
      return;
    }
    const adapter = this.applicationConfig.getIoAdapter();
    if (!adapter) {
      return;
    }
    const servers = this.socketsContainer.getAll();
    await Promise.all(
      iterate(servers.values())
        .filter(({ server }) => server)
        .map(async ({ server }) => adapter.close(server)),
    );
    await (adapter as AbstractWsAdapter)?.dispose();

    this.socketsContainer.clear();
  }

  /**
   * 初始化 WebSocket 适配器（惰性执行，仅在发现第一个网关时触发）。
   *
   * 处理步骤：
   * 1. 从应用选项中读取 forceCloseConnections（决定应用关闭时是否强制断开所有连接）；
   * 2. 若用户已通过 useWebSocketAdapter 配置了自定义适配器，则直接复用它并设置该选项；
   * 3. 否则通过 loadAdapter 惰性加载 @nestjs/platform-socket.io 中的默认 IoAdapter
   *    （该包可能未安装，加载失败会抛出带提示的错误）；
   * 4. 以 httpServer 为基础创建 IoAdapter 实例，写入配置并标记初始化完成。
   *
   * @returns 无返回值。
   */
  private initializeAdapter() {
    const forceCloseConnections = (this.appOptions as NestApplicationOptions)
      .forceCloseConnections;
    const adapter = this.applicationConfig.getIoAdapter();
    if (adapter) {
      (adapter as AbstractWsAdapter).forceCloseConnections =
        forceCloseConnections!;
      this.isAdapterInitialized = true;
      return;
    }
    const { IoAdapter } = loadAdapter(
      '@nestjs/platform-socket.io',
      'WebSockets',
      () => require('@nestjs/platform-socket.io'),
    );
    const ioAdapter = new IoAdapter(this.httpServer);
    ioAdapter.forceCloseConnections = forceCloseConnections;
    this.applicationConfig.setIoAdapter(ioAdapter);

    this.isAdapterInitialized = true;
  }

  /**
   * 创建 WebSocket 上下文创建器（WsContextCreator）。
   *
   * 它聚合了与 HTTP 侧对应的一整套上下文组件：
   * - WsProxy：函数代理，捕获同步异常并交给异常过滤器处理；
   * - ExceptionFiltersContext：WebSocket 异常过滤器上下文；
   * - PipesContextCreator / PipesConsumer：参数管道的创建与执行；
   * - GuardsContextCreator / GuardsConsumer：守卫的创建与执行；
   * - InterceptorsContextCreator / InterceptorsConsumer：拦截器的创建与执行。
   *
   * @param container - Nest 依赖注入容器，供各上下文创建器解析依赖实例。
   * @returns 组装完成的 WsContextCreator 实例。
   */
  private getContextCreator(container: NestContainer): WsContextCreator {
    return new WsContextCreator(
      new WsProxy(),
      new ExceptionFiltersContext(container),
      new PipesContextCreator(container),
      new PipesConsumer(),
      new GuardsContextCreator(container),
      new GuardsConsumer(),
      new InterceptorsContextCreator(container),
      new InterceptorsConsumer(),
    );
  }
}
