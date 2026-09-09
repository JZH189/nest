import { isFunction, isNil } from '@nestjs/common/utils/shared.utils';
import {
  AbstractWsAdapter,
  MessageMappingProperties,
} from '@nestjs/websockets';
import { DISCONNECT_EVENT } from '@nestjs/websockets/constants';
import { fromEvent, Observable } from 'rxjs';
import { filter, first, map, mergeMap, share, takeUntil } from 'rxjs/operators';
import { Server, ServerOptions, Socket } from 'socket.io';

/**
 * @publicApi
 *
 * Socket.IO 平台的 WebSocket 适配器：包装 socket.io 库的 Server/Socket，
 * 供 @WebSocketGateway() 装饰的网关使用（通过
 * `app.useWebSocketAdapter(new IoAdapter(app))` 启用）。
 *
 * 核心职责：
 * 1. create：按命名空间/已有 server/port 配置创建 socket.io Server 实例；
 * 2. bindMessageHandlers：把网关类中通过 @SubscribeMessage 声明的
 *    消息处理器绑定到 socket 事件上，接收消息 -> 调用处理方法 -> 回发结果
 *    （支持 ack 回调与手动 ack 模式）；
 * 3. mapPayload：把 socket.io 传来的原始负载解析为业务数据 + ack 回调。
 */
export class IoAdapter extends AbstractWsAdapter {
  /** 记录每个 socket 的断开事件流（WeakMap，socket 销毁后自动释放） */
  private readonly disconnectMap = new WeakMap<Socket, Observable<any>>();

  /**
   * 创建 Socket.IO 服务器实例（网关初始化时由框架调用）。
   * 支持三种形态：无选项（默认 server）、复用传入 server 的命名空间、
   * 按 port/options 创建并在其上划分命名空间。
   *
   * @param port - 监听端口；0 表示复用底层 HTTP 服务器。
   * @param options - socket.io 服务器选项，附加支持 namespace 与 server 字段。
   * @returns socket.io Server 实例（可能是某个命名空间实例）。
   */
  public create(
    port: number,
    options?: ServerOptions & { namespace?: string; server?: any },
  ): Server {
    if (!options) {
      return this.createIOServer(port);
    }
    const { namespace, server, ...opt } = options;
    // 1. 传入的 server 已存在时，直接在其上取命名空间
    // 2. 指定 namespace 时，先创建服务器再切到对应命名空间
    // 3. 普通情况按选项直接创建
    return server && isFunction(server.of)
      ? server.of(namespace)
      : namespace
        ? this.createIOServer(port, opt).of(namespace)
        : this.createIOServer(port, opt);
  }

  /**
   * 创建底层 socket.io Server：port 为 0 且持有 httpServer 时挂到已有
   * HTTP 服务器上（与 Express 同端口），否则独立监听新端口。
   *
   * @param port - 监听端口。
   * @param options - socket.io Server 选项。
   * @returns 新建的 socket.io Server 实例。
   */
  public createIOServer(port: number, options?: any): any {
    if (this.httpServer && port === 0) {
      return new Server(this.httpServer, options);
    }
    return new Server(port, options);
  }

  /**
   * 把消息处理器绑定到客户端 socket：为每个 @SubscribeMessage 事件
   * 建立 RxJS 事件流，消息到达 -> 调用网关方法 -> 把结果回发给客户端。
   *
   * 流程：
   * 1. 获取（或创建并缓存）该 socket 的 disconnect 事件流，用于在断开时
   *    自动取消订阅所有处理器（takeUntil）；
   * 2. 对每个 handler：监听消息事件 -> mapPayload 解析出 data 与 ack ->
   *    transform 调用网关处理方法并过滤空结果；
   * 3. 订阅结果：响应含 event 字段时用 socket.emit 指定事件回发，
   *    否则在未手动处理 ack 时自动调用 ack 回调。
   *
   * @param socket - 客户端 socket 连接。
   * @param handlers - 网关中声明的消息处理器集合（来自元数据探索器）。
   * @param transform - 把处理方法返回值转换为 Observable 的适配函数。
   */
  public bindMessageHandlers(
    socket: Socket,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ) {
    let disconnect$ = this.disconnectMap.get(socket);
    if (!disconnect$) {
      disconnect$ = fromEvent(socket, DISCONNECT_EVENT).pipe(share(), first());
      this.disconnectMap.set(socket, disconnect$);
    }

    handlers.forEach(({ message, callback, isAckHandledManually }) => {
      const source$ = fromEvent(socket, message).pipe(
        mergeMap((payload: any) => {
          const { data, ack } = this.mapPayload(payload);
          return transform(callback(data, ack)).pipe(
            filter((response: any) => !isNil(response)),
            map((response: any) => [response, ack, isAckHandledManually]),
          );
        }),
        takeUntil(disconnect$),
      );
      source$.subscribe(([response, ack, isAckHandledManually]) => {
        if (response.event) {
          return socket.emit(response.event, response.data);
        }
        if (!isAckHandledManually && isFunction(ack)) {
          ack(response);
        }
      });
    });
  }

  /**
   * 解析消息负载：socket.io 的消息格式可能是单个数据、
   * "数据 + ack 回调" 数组、或单独的 ack 回调。
   *
   * @param payload - 客户端发来的原始负载。
   * @returns 解析结果：data 为业务数据，ack 为确认回调（如有）。
   */
  public mapPayload(payload: unknown): { data: any; ack?: Function } {
    // 1. 非数组负载：函数即为 ack 回调，否则整体作为业务数据
    if (!Array.isArray(payload)) {
      if (isFunction(payload)) {
        return { data: undefined, ack: payload };
      }
      return { data: payload };
    }
    // 2. 数组负载：最后一个元素是函数时视为 ack，其余部分作为 data
    const lastElement = payload[payload.length - 1];
    const isAck = isFunction(lastElement);
    if (isAck) {
      const size = payload.length - 1;
      return {
        data: size === 1 ? payload[0] : payload.slice(0, size),
        ack: lastElement,
      };
    }
    return { data: payload };
  }

  /**
   * 关闭服务器：当适配器复用了应用自身的 HTTP 服务器且要求强制关闭
   * 连接时，跳过关闭（避免把整个 HTTP 应用一起关掉），其余情况交给父类。
   *
   * @param server - 待关闭的 socket.io Server。
   */
  public async close(server: Server): Promise<void> {
    if (this.forceCloseConnections && server.httpServer === this.httpServer) {
      return;
    }

    return super.close(server);
  }
}
