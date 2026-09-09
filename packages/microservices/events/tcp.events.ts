/** 无参数回调类型 */
type VoidCallback = () => void;
/** 错误回调类型 */
type OnErrorCallback = (error: Error) => void;
/** DNS 查询回调类型：携带错误、地址、协议族与主机名 */
type OnLookupCallback = (
  err: Error,
  address: string,
  family: string,
  host: string,
) => void;

/**
 * TCP 连接状态。
 *
 * ClientTCP / ServerTCP 通过状态变更事件向外广播自身的连接状况。
 */
export const enum TcpStatus {
  /** 已断开连接 */
  DISCONNECTED = 'disconnected',
  /** 已连接 */
  CONNECTED = 'connected',
}

/**
 * TCP 底层 socket（net.Socket / net.Server）的原生事件名映射，
 * 用于监听连接的生命周期事件。
 */
export const enum TcpEventsMap {
  /** 发生错误 */
  ERROR = 'error',
  /** 连接成功（服务端为收到新连接 / 开始监听） */
  CONNECT = 'connect',
  /** 连接另一端发送了 FIN（半关闭） */
  END = 'end',
  /** 连接完全关闭 */
  CLOSE = 'close',
  /** 连接空闲超时 */
  TIMEOUT = 'timeout',
  /** 写缓冲区已排空（可恢复写入） */
  DRAIN = 'drain',
  /** 主机名 DNS 解析完成 */
  LOOKUP = 'lookup',
  /** 服务端开始监听 */
  LISTENING = 'listening',
}

/**
 * TCP socket（net 模块）的事件映射。
 * 键为事件名，值为对应的回调函数签名。
 * @publicApi
 */
export type TcpEvents = {
  error: OnErrorCallback;
  connect: VoidCallback;
  end: VoidCallback;
  close: VoidCallback;
  timeout: VoidCallback;
  drain: VoidCallback;
  lookup: OnLookupCallback;
};
