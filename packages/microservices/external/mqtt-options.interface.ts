/**
 * MQTT 消息的服务质量等级（QoS，第三方 MQTT.js 的类型声明镜像）：
 * - 0：至多一次（可能丢失）；
 * - 1：至少一次（可能重复）；
 * - 2：恰好一次（开销最大）。
 *
 * @see https://github.com/mqttjs/MQTT.js/
 *
 * @publicApi
 */
export declare type QoS = 0 | 1 | 2;

/**
 * MQTT 客户端连接选项（对应 MQTT.js 的 MqttClientOptions），
 * 用于 ServerMqtt/ClientMqtt 创建底层客户端，关键字段：
 * - url/port/host/protocol：连接目标与协议（mqtt/mqtts/ws/wss 等）；
 * - clientId：客户端唯一标识（默认随机生成）；
 * - keepalive：心跳间隔（秒），0 表示禁用；
 * - clean：是否使用全新会话（false 时 broker 会保留离线期间的 QoS 1/2 消息）；
 * - reconnectPeriod/connectTimeout：重连间隔与连接超时（毫秒）；
 * - username/password：broker 认证凭据；
 * - will：遗嘱消息（客户端异常断开时由 broker 代为发布）；
 * - properties：MQTT 5.0 专属属性。
 */
export interface MqttClientOptions extends ISecureClientOptions {
  port?: number; // port is made into a number subsequently
  host?: string; // host does NOT include port
  hostname?: string;
  path?: string;
  protocol?: 'wss' | 'ws' | 'mqtt' | 'mqtts' | 'tcp' | 'ssl' | 'wx' | 'wxs';

  wsOptions?: {
    [x: string]: any;
  };
  /**
   *  10 seconds, set to 0 to disable
   */
  keepalive?: number;
  /**
   * 'mqttjs_' + Math.random().toString(16).substr(2, 8)
   */
  clientId?: string;
  /**
   * 'MQTT'
   */
  protocolId?: string;
  /**
   * 4
   */
  protocolVersion?: number;
  /**
   * true, set to false to receive QoS 1 and 2 messages while offline
   */
  clean?: boolean;
  /**
   * 1000 milliseconds, interval between two reconnections
   */
  reconnectPeriod?: number;
  /**
   * 30 * 1000 milliseconds, time to wait before a CONNACK is received
   */
  connectTimeout?: number;
  /**
   * the username required by your broker, if any
   */
  username?: string;
  /**
   * the password required by your broker, if any
   */
  password?: string;
  /**
   * a any for the incoming packets
   */
  incomingStore?: any;
  /**
   * a any for the outgoing packets
   */
  outgoingStore?: any;
  queueQoSZero?: boolean;
  /**
   *  properties MQTT 5.0.
   */
  properties?: {
    /**
     * representing the Session Expiry Interval in seconds
     */
    sessionExpiryInterval?: number;
    /**
     * representing the Receive Maximum
     */
    receiveMaximum?: number;
    /**
     * representing the Maximum Packet Size the Client is willing to accept
     */
    maximumPacketSize?: number;
    /**
     * representing the Topic Alias Maximum value indicates the highest value that the Client will accept as a Topic Alias sent by the Server
     */
    topicAliasMaximum?: number;
    /**
     * The Client uses this value to request the Server to return Response Information in the CONNACK
     */
    requestResponseInformation?: boolean;
    /**
     * The Client uses this value to indicate whether the Reason String or User Properties are sent in the case of failures
     */
    requestProblemInformation?: boolean;
    /**
     * The User Property is allowed to appear multiple times to represent multiple name, value pairs
     */
    userProperties?: object;
    /**
     * the name of the authentication method used for extended authentication
     */
    authenticationMethod?: string;
    /**
     * * Binary Data containing authentication data (binary type)
     * */
    authenticationData?: any;
  };
  reschedulePings?: boolean;
  servers?: Array<{
    host: string;
    port: number;
  }>;
  /**
   * true, set to false to disable re-subscribe functionality
   */
  resubscribe?: boolean;
  /**
   * a message that will sent by the broker automatically when the client disconnect badly.
   */
  will?: {
    /**
     * the topic to publish
     */
    topic: string;
    /**
     * the message to publish
     */
    payload: string;
    /**
     * the QoS
     */
    qos: QoS;
    /**
     * the retain flag
     */
    retain: boolean;
  };
  transformWsUrl?: (url: string, options: any, client: any) => string;
}
/**
 * 安全连接选项：TLS/SSL 证书相关配置（私钥、证书链、CA 证书等）。
 */
export interface ISecureClientOptions {
  /**
   * optional private keys in PEM format
   */
  key?: string | string[] | Buffer | Buffer[] | Record<string, any>[];
  /**
   * optional cert chains in PEM format
   */
  cert?: string | string[] | Buffer | Buffer[];
  /**
   * Optionally override the trusted CA certificates in PEM format
   */
  ca?: string | string[] | Buffer | Buffer[];
  rejectUnauthorized?: boolean;
}
/**
 * 发布消息时的选项（对应 MQTT.js 的 IClientPublishOptions）：
 * - qos：消息服务质量等级；
 * - retain：是否为保留消息（broker 会为后来订阅者保留最后一条）；
 * - dup：是否为重复投递的 QoS 1/2 消息。
 */
export interface IClientPublishOptions {
  /**
   * the QoS
   */
  qos: QoS;
  /**
   * the retain flag
   */
  retain?: boolean;
  /**
   * whether or not mark a message as duplicate
   */
  dup?: boolean;
}
/**
 * 订阅 topic 时的选项（对应 MQTT.js 的 IClientSubscribeOptions）：
 * - qos：订阅的期望服务质量等级。
 */
export interface IClientSubscribeOptions {
  /**
   * the QoS
   */
  qos: QoS;
}
/**
 * 重连时的选项（对应 MQTT.js 的 IClientReconnectOptions）：
 * - incomingStore/outgoingStore：QoS 1/2 消息的离线收/发缓存存储。
 */
export interface IClientReconnectOptions {
  /**
   * a any for the incoming packets
   */
  incomingStore?: any;
  /**
   * a any for the outgoing packets
   */
  outgoingStore?: any;
}
