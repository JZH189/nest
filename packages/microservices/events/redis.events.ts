/** 回调类型：携带触发事件的客户端标识（发布端 'pub' 或订阅端 'sub'） */
type VoidCallback = (client: 'pub' | 'sub') => void;
/** 错误回调类型：携带客户端标识与错误对象 */
type OnErrorCallback = (client: 'pub' | 'sub', error: Error) => void;
/** 警告回调类型：携带客户端标识与警告信息 */
type OnWarningCallback = (client: 'pub' | 'sub', warning: any) => void;

/**
 * Redis 客户端连接状态。
 *
 * ClientRedis / ServerRedis 通过状态变更事件向外广播自身的连接状况。
 * 注意 Redis 传输器同时维护发布与订阅两个连接（pub/sub），
 * 事件回调会指明是哪个连接触发的。
 */
export const enum RedisStatus {
  /** 已断开连接 */
  DISCONNECTED = 'disconnected',
  /** 正在重连 */
  RECONNECTING = 'reconnecting',
  /** 已连接 */
  CONNECTED = 'connected',
}

/**
 * Redis 底层客户端（redis 包）的原生事件名映射，
 * 用于监听发布/订阅连接的生命周期事件。
 */
export const enum RedisEventsMap {
  /** 连接建立 */
  CONNECT = 'connect',
  /** 连接就绪（握手完成，可以执行命令） */
  READY = 'ready',
  /** 发生错误 */
  ERROR = 'error',
  /** 连接关闭 */
  CLOSE = 'close',
  /** 正在重连 */
  RECONNECTING = 'reconnecting',
  /** 连接已完全终止 */
  END = 'end',
  /** 收到警告 */
  WARNING = 'warning',
}

/**
 * Redis 客户端（redis 包）的事件映射。
 * 键为事件名，值为对应的回调函数签名。
 * @publicApi
 */
export type RedisEvents = {
  connect: VoidCallback;
  ready: VoidCallback;
  error: OnErrorCallback;
  close: VoidCallback;
  reconnecting: VoidCallback;
  end: VoidCallback;
  warning: OnWarningCallback;
};
