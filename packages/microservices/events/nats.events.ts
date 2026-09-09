/** 默认回调类型：可携带字符串/数字负载 */
type DefaultCallback = (data?: string | number) => any;

/**
 * NATS 服务器变更事件负载：描述本次集群更新中
 * 新增（added）与移除（deleted）的服务器地址列表。
 */
export type ServersChangedEvent = {
  added: string[];
  deleted: string[];
};

/**
 * NATS 客户端连接状态。
 *
 * ClientNats / ServerNats 通过状态变更事件向外广播自身的连接状况。
 */
export const enum NatsStatus {
  /** 已断开连接 */
  DISCONNECTED = 'disconnected',
  /** 正在重连 */
  RECONNECTING = 'reconnecting',
  /** 已连接 */
  CONNECTED = 'connected',
}

/**
 * NATS 底层客户端（nats.js）的原生事件名映射，
 * 用于监听连接生命周期与集群服务器变更事件。
 */
export const enum NatsEventsMap {
  /** 断开连接 */
  DISCONNECT = 'disconnect',
  /** 重新连接 */
  RECONNECT = 'reconnect',
  /** 集群服务器列表发生变化 */
  UPDATE = 'update',
}

/**
 * NATS 客户端（nats.js）的事件映射。
 * 键为事件名，值为对应的回调函数签名。
 * @publicApi
 */
export type NatsEvents = {
  disconnect: DefaultCallback;
  reconnect: DefaultCallback;
  update: (data?: string | number | ServersChangedEvent) => any;
};
