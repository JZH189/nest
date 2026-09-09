/** 无参数回调类型 */
type VoidCallback = () => void;
/** 收到数据包/事件的回调类型 */
type OnPacketCallback = (packet: any) => void;
/** 错误回调类型 */
type OnErrorCallback = (error: Error) => void;

/**
 * MQTT 客户端连接状态。
 *
 * ClientMqtt / ServerMqtt 通过状态变更事件向外广播自身的连接状况。
 */
export const enum MqttStatus {
  /** 已断开连接 */
  DISCONNECTED = 'disconnected',
  /** 正在重连 */
  RECONNECTING = 'reconnecting',
  /** 已连接 */
  CONNECTED = 'connected',
  /** 连接已关闭 */
  CLOSED = 'closed',
}

/**
 * MQTT 底层客户端（MQTT.js）的原生事件名映射，
 * 用于监听连接生命周期与数据包收发事件。
 */
export const enum MqttEventsMap {
  /** 连接成功 */
  CONNECT = 'connect',
  /** 开始重连 */
  RECONNECT = 'reconnect',
  /** 主动断开 */
  DISCONNECT = 'disconnect',
  /** 连接关闭 */
  CLOSE = 'close',
  /** 客户端离线 */
  OFFLINE = 'offline',
  /** 客户端已完全终止 */
  END = 'end',
  /** 发生错误 */
  ERROR = 'error',
  /** 收到底层协议数据包 */
  PACKETRECEIVE = 'packetreceive',
  /** 发出底层协议数据包 */
  PACKETSEND = 'packetsend',
}

/**
 * MQTT 客户端（MQTT.js）的事件映射。
 * 键为事件名，值为对应的回调函数签名。
 * @publicApi
 */
export type MqttEvents = {
  connect: OnPacketCallback;
  reconnect: VoidCallback;
  disconnect: OnPacketCallback;
  close: VoidCallback;
  offline: VoidCallback;
  end: VoidCallback;
  error: OnErrorCallback;
  packetreceive: OnPacketCallback;
  packetsend: OnPacketCallback;
};
