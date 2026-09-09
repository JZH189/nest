import { ReplaySubject, Subject } from 'rxjs';
import { ServerAndEventStreamsHost } from '../interfaces/server-and-event-streams-host.interface';

/**
 * 服务器与事件流工厂：把底层 WebSocket 服务器包装为
 * ServerAndEventStreamsHost，即在服务器之外附加三个 RxJS 事件流，
 * 供 WebSocketsController 订阅网关生命周期钩子。
 */
export class ServerAndEventStreamsFactory {
  /**
   * 创建服务器与事件流宿主。
   *
   * 处理步骤：
   * 1. 创建 init 流（ReplaySubject）并立即发射一次服务器实例，
   *    保证 afterInit 钩子即使晚订阅也能收到；
   * 2. 创建 connection 与 disconnect 两个 Subject，
   *    分别由连接/断开事件驱动（handleConnection/handleDisconnect）。
   *
   * @param server - 底层 WebSocket 服务器实例。
   * @returns 包含 server 与 init/connection/disconnect 事件流的宿主对象。
   */
  public static create<T = any>(server: T): ServerAndEventStreamsHost<T> {
    const init = new ReplaySubject<T>();
    init.next(server);

    const connection = new Subject();
    const disconnect = new Subject();
    return {
      init,
      connection,
      disconnect,
      server,
    };
  }
}
