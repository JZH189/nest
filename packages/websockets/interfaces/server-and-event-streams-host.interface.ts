import { ReplaySubject, Subject } from 'rxjs';

/**
 * 服务器与事件流宿主：底层 WebSocket 服务器实例 + 三个生命周期事件流，
 * 由 ServerAndEventStreamsFactory 创建，供网关订阅 init/connection/disconnect。
 *
 * @typeParam T - 底层服务器实例类型。
 * @publicApi
 */
export interface ServerAndEventStreamsHost<T = any> {
  server: T;
  init: ReplaySubject<T>;
  connection: Subject<any>;
  disconnect: Subject<any>;
}
