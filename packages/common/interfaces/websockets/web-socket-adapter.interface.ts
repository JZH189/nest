import { Observable } from 'rxjs';

/**
 * 描述一条 WebSocket 消息处理器的绑定信息。
 * 由网关（Gateway）将 `@SubscribeMessage()` 声明的处理方法收集为该结构，
 * 交给 WebSocket 适配器分发调用。
 *
 * @publicApi
 */
export interface WsMessageHandler<T = string> {
  /** 匹配的消息模式（事件名） */
  message: T;
  /** 消息到达时调用的处理回调（即网关中的消息处理方法） */
  callback: (...args: any[]) => Observable<any> | Promise<any>;
  /** 是否由用户手动发送 ACK 确认（配合 `@Ack()` 使用） */
  isAckHandledManually: boolean;
}

/**
 * WebSocket 适配器的契约，用于屏蔽不同 WS 库（如 socket.io、ws）的差异。
 * 通过 `app.useWebSocketAdapter()` 注入自定义实现，由网关（WebSocket 模块）消费，
 * 负责创建服务器、绑定客户端连接/断开事件、分发消息处理器。
 *
 * @publicApi
 */
export interface WebSocketAdapter<
  TServer = any,
  TClient = any,
  TOptions = any,
> {
  /** 创建底层 WebSocket 服务器实例 */
  create(port: number, options?: TOptions): TServer;
  /** 绑定"客户端连接"事件回调 */
  bindClientConnect(server: TServer, callback: Function): any;
  /** 绑定"客户端断开"事件回调 */
  bindClientDisconnect?(client: TClient, callback: Function): any;
  /** 把消息处理器集合绑定到指定客户端，transform 用于把原始消息转换为 Observable 流 */
  bindMessageHandlers(
    client: TClient,
    handlers: WsMessageHandler[],
    transform: (data: any) => Observable<any>,
  ): any;
  /** 关闭 WebSocket 服务器 */
  close(server: TServer): any;
}
