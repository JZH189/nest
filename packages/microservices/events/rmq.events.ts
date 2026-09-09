/** 无参数回调类型 */
type VoidCallback = () => void;
/** 错误回调类型 */
type OnErrorCallback = (error: Error) => void;
/** 连接被 broker 阻断时的回调类型（携带原因） */
type OnBlockedCallback = (arg: { reason: string }) => void;

/**
 * RabbitMQ 连接状态。
 *
 * ClientRmq / ServerRmq 通过状态变更事件向外广播自身的连接状况。
 */
export const enum RmqStatus {
  /** 已断开连接 */
  DISCONNECTED = 'disconnected',
  /** 已连接 */
  CONNECTED = 'connected',
  /** 连接被 broker 阻断（如内存/磁盘达到告警阈值） */
  BLOCKED = 'blocked',
  /** 连接已解除阻断 */
  UNBLOCKED = 'unblocked',
}

/**
 * RabbitMQ 底层客户端（amqplib）的原生事件名映射，
 * 用于监听连接生命周期事件。
 */
export const enum RmqEventsMap {
  /** 发生错误 */
  ERROR = 'error',
  /** 断开连接 */
  DISCONNECT = 'disconnect',
  /** 连接成功 */
  CONNECT = 'connect',
  /** 连接被 broker 阻断 */
  BLOCKED = 'blocked',
  /** 连接解除阻断 */
  UNBLOCKED = 'unblocked',
}

/**
 * RabbitMQ 客户端（amqplib）的事件映射。
 * 键为事件名，值为对应的回调函数签名。
 * @publicApi
 */
export type RmqEvents = {
  error: OnErrorCallback;
  disconnect: VoidCallback;
  connect: VoidCallback;
  blocked: OnBlockedCallback;
  unblocked: VoidCallback;
};
