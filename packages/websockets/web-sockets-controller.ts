import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { Type } from '@nestjs/common/interfaces/type.interface';
import { Logger } from '@nestjs/common/services/logger.service';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import {
  from as fromPromise,
  isObservable,
  Observable,
  of,
  Subject,
} from 'rxjs';
import { distinctUntilChanged, mergeAll } from 'rxjs/operators';
import { GATEWAY_OPTIONS, PORT_METADATA } from './constants';
import { WsContextCreator } from './context/ws-context-creator';
import { InvalidSocketPortException } from './errors/invalid-socket-port.exception';
import {
  GatewayMetadataExplorer,
  MessageMappingProperties,
} from './gateway-metadata-explorer';
import { GatewayMetadata } from './interfaces/gateway-metadata.interface';
import { NestGateway } from './interfaces/nest-gateway.interface';
import { ServerAndEventStreamsHost } from './interfaces/server-and-event-streams-host.interface';
import { WebsocketEntrypointMetadata } from './interfaces/websockets-entrypoint-metadata.interface';
import { SocketServerProvider } from './socket-server-provider';
import { compareElementAt } from './utils/compare-element.util';

/**
 * WebSocket 控制器：网关机制的“调度中枢”。
 *
 * SocketModule 扫描到网关类后会委托本类完成：
 * 1. 读取网关元数据（端口、选项）并校验端口合法性；
 * 2. 通过 GatewayMetadataExplorer 探测所有 @SubscribeMessage 标记的消息处理方法，
 *    并用 WsContextCreator 为每个回调包装完整的执行链（守卫/拦截器/管道/过滤器）；
 * 3. 通过 SocketServerProvider 获取（或创建）WebSocket 服务器；
 * 4. 将服务器实例注入 @WebSocketServer 标记的属性；
 * 5. 订阅 init/connection/disconnect 生命周期事件，并为每个客户端连接绑定消息处理器。
 */
export class WebSocketsController {
  private readonly logger = new Logger(WebSocketsController.name, {
    timestamp: true,
  });
  /** 元数据探测器，用于扫描网关类上的消息处理方法与服务器注入点。 */
  private readonly metadataExplorer = new GatewayMetadataExplorer(
    new MetadataScanner(),
  );

  constructor(
    /** 服务器提供者，负责按配置获取或创建 WebSocket 服务器。 */
    private readonly socketServerProvider: SocketServerProvider,
    /** 应用配置，用于获取全局 IoAdapter。 */
    private readonly config: ApplicationConfig,
    /** WebSocket 上下文创建器，把原始方法回调包装为带完整中间件的处理器。 */
    private readonly contextCreator: WsContextCreator,
    /** 依赖图检查器，用于向外部工具暴露入口点定义。 */
    private readonly graphInspector: GraphInspector,
    /** 应用选项（preview 模式下仅检查不实际启动订阅）。 */
    private readonly appOptions: NestApplicationContextOptions = {},
  ) {}

  /**
   * 将单个网关实例连接到（尚未创建的）WebSocket 服务器。
   *
   * 处理步骤：
   * 1. 从网关类元数据中读取 GATEWAY_OPTIONS（网关选项）与 PORT_METADATA（端口），
   *    端口缺省为 0（表示复用 HTTP 服务器端口）；
   * 2. 校验端口必须是整数，否则抛出 InvalidSocketPortException；
   * 3. 委托 subscribeToServerEvents 完成服务器获取与事件订阅。
   *
   * @param instance - 网关类的实例。
   * @param metatype - 网关类的元类型（构造函数）。
   * @param moduleKey - 网关所在模块的标识。
   * @param instanceWrapperId - 实例包装器 ID，用于依赖图标记。
   * @returns 无返回值。
   */
  public connectGatewayToServer(
    instance: NestGateway,
    metatype: Type<unknown> | Function,
    moduleKey: string,
    instanceWrapperId: string,
  ) {
    const options = Reflect.getMetadata(GATEWAY_OPTIONS, metatype) || {};
    const port = Reflect.getMetadata(PORT_METADATA, metatype) || 0;

    if (!Number.isInteger(port)) {
      throw new InvalidSocketPortException(port, metatype);
    }
    this.subscribeToServerEvents(
      instance,
      options,
      port,
      moduleKey,
      instanceWrapperId,
    );
  }

  /**
   * 订阅服务器事件：探索消息处理器、注入服务器实例并完成事件绑定。
   *
   * 处理步骤：
   * 1. 使用元数据探测器扫描实例上所有 @SubscribeMessage 标记的方法；
   * 2. 对每个原始回调调用 WsContextCreator.create，生成携带守卫/拦截器/管道/异常过滤器的
   *    增强回调（messageHandlers）；
   * 3. 将入口点定义写入 GraphInspector（供外部工具如 NRTC/可视化面板使用）；
   * 4. 若处于 preview（预览）模式，仅完成上述检查，不实际启动服务器；
   * 5. 通过 SocketServerProvider 按配置获取（或创建）observableServer；
   * 6. 将服务器实例赋值给 @WebSocketServer 标记的属性；
   * 7. 订阅 init/connection/disconnect 事件并绑定消息分发逻辑。
   *
   * @param instance - 网关实例。
   * @param options - 网关元数据选项（@WebSocketGateway 的参数）。
   * @param port - 监听端口。
   * @param moduleKey - 所在模块标识。
   * @param instanceWrapperId - 实例包装器 ID。
   * @returns 无返回值。
   */
  public subscribeToServerEvents<T extends GatewayMetadata>(
    instance: NestGateway,
    options: T,
    port: number,
    moduleKey: string,
    instanceWrapperId: string,
  ) {
    const nativeMessageHandlers = this.metadataExplorer.explore(instance);
    const messageHandlers = nativeMessageHandlers.map(
      ({ callback, isAckHandledManually, message, methodName }) => ({
        message,
        methodName,
        callback: this.contextCreator.create(
          instance,
          callback,
          moduleKey,
          methodName,
        ),
        isAckHandledManually,
      }),
    );

    this.inspectEntrypointDefinitions(
      instance,
      port,
      messageHandlers,
      instanceWrapperId,
    );

    if (this.appOptions.preview) {
      return;
    }
    const observableServer = this.socketServerProvider.scanForSocketServer<T>(
      options,
      port,
    );
    this.assignServerToProperties(instance, observableServer.server);
    this.subscribeEvents(instance, messageHandlers, observableServer);
  }

  /**
   * 将网关的各生命周期事件与消息处理器绑定到底层服务器。
   *
   * 处理步骤：
   * 1. 从 observableServer 中解构 init/disconnect/connection 事件流与 server 实例；
   * 2. 订阅 afterInit 钩子（若网关实现了 afterInit）；
   * 3. 订阅 handleConnection 钩子（若实现）；
   * 4. 订阅 handleDisconnect 钩子（若实现）；
   * 5. 构造连接处理器并通过 adapter.bindClientConnect 绑定到服务器的连接事件，
   *    使每个新客户端的消息都能被分发给 @SubscribeMessage 方法；
   * 6. 打印订阅日志（如 "XxxGateway subscribed to the "message" message"）。
   *
   * @param instance - 网关实例。
   * @param subscribersMap - 探测到的消息处理方法映射。
   * @param observableServer - 包含服务器实例与 init/connection/disconnect 事件流的宿主。
   * @returns 无返回值。
   */
  public subscribeEvents(
    instance: NestGateway,
    subscribersMap: MessageMappingProperties[],
    observableServer: ServerAndEventStreamsHost,
  ) {
    const { init, disconnect, connection, server } = observableServer;
    const adapter = this.config.getIoAdapter();

    this.subscribeInitEvent(instance, init);
    this.subscribeConnectionEvent(instance, connection);
    this.subscribeDisconnectEvent(instance, disconnect);

    const handler = this.getConnectionHandler(
      this,
      instance,
      subscribersMap,
      disconnect,
      connection,
    );
    adapter.bindClientConnect(server, handler);
    this.printSubscriptionLogs(instance, subscribersMap);
  }

  /**
   * 构造“客户端连接”事件处理器（即服务器每次收到新连接时执行的回调）。
   *
   * 处理步骤：
   * 1. 回调触发时取出第一个参数 client（新连接的客户端 socket）；
   * 2. 将连接参数推入 connection 事件流（触发网关的 handleConnection 钩子）；
   * 3. 调用 subscribeMessages 为该客户端绑定消息处理器；
   * 4. 若适配器支持 bindClientDisconnect，则绑定断开回调，
   *    在客户端断开时将 client 推入 disconnect 事件流（触发 handleDisconnect）。
   *
   * @param context - WebSocketsController 自身的引用（便于在回调中访问实例方法）。
   * @param instance - 网关实例。
   * @param subscribersMap - 消息处理方法映射。
   * @param disconnect - 断开事件 Subject。
   * @param connection - 连接事件 Subject。
   * @returns 可直接绑定到服务器 connect 事件的处理器函数。
   */
  public getConnectionHandler(
    context: WebSocketsController,
    instance: NestGateway,
    subscribersMap: MessageMappingProperties[],
    disconnect: Subject<any>,
    connection: Subject<any>,
  ) {
    const adapter = this.config.getIoAdapter();
    return (...args: unknown[]) => {
      const [client] = args;
      connection.next(args);
      context.subscribeMessages(subscribersMap, client, instance);

      const disconnectHook = adapter.bindClientDisconnect;
      disconnectHook &&
        disconnectHook.call(adapter, client, () => disconnect.next(client));
    };
  }

  /**
   * 订阅初始化事件：服务器初始化完成后调用网关的 afterInit 钩子。
   *
   * @param instance - 网关实例。
   * @param event - 初始化事件流（afterInit）。
   * @returns 无返回值。
   */
  public subscribeInitEvent(instance: NestGateway, event: Subject<any>) {
    if (instance.afterInit) {
      event.subscribe(instance.afterInit.bind(instance));
    }
  }

  /**
   * 订阅连接事件：新客户端接入时调用网关的 handleConnection 钩子。
   *
   * 处理步骤：
   * 1. 使用 distinctUntilChanged + compareElementAt 按第一个参数（client）去重，
   *    防止同一客户端重复触发钩子；
   * 2. 将连接参数转发给网关的 handleConnection 方法。
   *
   * @param instance - 网关实例。
   * @param event - 连接事件流（connection）。
   * @returns 无返回值。
   */
  public subscribeConnectionEvent(instance: NestGateway, event: Subject<any>) {
    if (instance.handleConnection) {
      event
        .pipe(
          distinctUntilChanged((prev, curr) => compareElementAt(prev, curr, 0)),
        )
        .subscribe((args: unknown[]) => instance.handleConnection!(...args));
    }
  }

  /**
   * 订阅断开事件：客户端断开时调用网关的 handleDisconnect 钩子。
   *
   * 处理步骤：使用 distinctUntilChanged 去重后，将断开的客户端转发给
   * 网关的 handleDisconnect 方法。
   *
   * @param instance - 网关实例。
   * @param event - 断开事件流（disconnect）。
   * @returns 无返回值。
   */
  public subscribeDisconnectEvent(instance: NestGateway, event: Subject<any>) {
    if (instance.handleDisconnect) {
      event
        .pipe(distinctUntilChanged())
        .subscribe(instance.handleDisconnect.bind(instance));
    }
  }

  /**
   * 为指定客户端绑定消息处理器：把 @SubscribeMessage 方法与该客户端关联，
   * 并委托适配器在消息到达时执行对应处理器。
   *
   * 处理步骤：
   * 1. 获取全局 IoAdapter；
   * 2. 遍历 subscribersMap，将每个回调通过 bind(instance, client) 预绑定
   *    实例与客户端（作为处理器前两个参数，对应 @ConnectedSocket/@MessageBody）；
   * 3. 调用 adapter.bindMessageHandlers，适配器会在消息到达时调用处理器，
   *    处理器返回的 Promise 结果经 pickResult 归一化为 Observable 后用 mergeAll 合并输出。
   *
   * @param subscribersMap - 消息处理方法映射。
   * @param client - 当前连接的客户端 socket。
   * @param instance - 网关实例。
   * @returns 无返回值。
   */
  public subscribeMessages<T = any>(
    subscribersMap: MessageMappingProperties[],
    client: T,
    instance: NestGateway,
  ) {
    const adapter = this.config.getIoAdapter();
    const handlers = subscribersMap.map(
      ({ callback, message, isAckHandledManually }) => ({
        message,
        callback: callback.bind(instance, client),
        isAckHandledManually,
      }),
    );
    adapter.bindMessageHandlers(client, handlers, data =>
      fromPromise(this.pickResult(data)).pipe(mergeAll()),
    );
  }

  /**
   * 将消息处理器的返回值归一化为 Observable 流。
   *
   * 处理步骤：
   * 1. 等待异步结果；
   * 2. 若结果本身是 Observable，直接返回；
   * 3. 若结果是 Promise，包装为 Observable；
   * 4. 其他普通值包装为单元素 of 流。
   *
   * @param deferredResult - 处理器执行后返回的 Promise（内部可能是任意形式的返回值）。
   * @returns 归一化后的 Observable，供下游 mergeAll 合并并回传给客户端。
   */
  public async pickResult(
    deferredResult: Promise<any>,
  ): Promise<Observable<any>> {
    const result = await deferredResult;
    if (isObservable(result)) {
      return result;
    }
    if (result instanceof Promise) {
      return fromPromise(result);
    }
    return of(result);
  }

  /**
   * 将每个消息处理方法作为 WebSocket 入口点定义注册到 GraphInspector，
   * 供外部可视化/诊断工具（如 Nest DevTools）展示。
   *
   * @param instance - 网关实例。
   * @param port - 网关监听端口。
   * @param messageHandlers - 探测到的消息处理方法映射。
   * @param instanceWrapperId - 实例包装器 ID（作为类节点 ID）。
   * @returns 无返回值。
   */
  public inspectEntrypointDefinitions(
    instance: NestGateway,
    port: number,
    messageHandlers: MessageMappingProperties[],
    instanceWrapperId: string,
  ) {
    messageHandlers.forEach(handler => {
      this.graphInspector.insertEntrypointDefinition<WebsocketEntrypointMetadata>(
        {
          type: 'websocket',
          methodName: handler.methodName,
          className: instance.constructor?.name,
          classNodeId: instanceWrapperId,
          metadata: {
            port,
            key: handler.message,
            message: handler.message,
          },
        },
        instanceWrapperId,
      );
    });
  }

  /**
   * 将 WebSocket 服务器实例注入到网关中所有被 @WebSocketServer 标记的属性。
   *
   * @param instance - 网关实例。
   * @param server - 底层 WebSocket 服务器实例。
   * @returns 无返回值。
   */
  private assignServerToProperties<T = any>(
    instance: NestGateway,
    server: object,
  ) {
    for (const propertyKey of this.metadataExplorer.scanForServerHooks(
      instance,
    )) {
      Reflect.set(instance, propertyKey, server);
    }
  }

  /**
   * 打印网关订阅日志，便于开发者确认哪些消息事件被订阅。
   *
   * @param instance - 网关实例。
   * @param subscribersMap - 消息处理方法映射。
   * @returns 无返回值。
   */
  private printSubscriptionLogs(
    instance: NestGateway,
    subscribersMap: MessageMappingProperties[],
  ) {
    const gatewayClassName = (instance as object)?.constructor?.name;
    if (!gatewayClassName) {
      return;
    }
    subscribersMap.forEach(({ message }) =>
      this.logger.log(
        `${gatewayClassName} subscribed to the "${message}" message`,
      ),
    );
  }
}
