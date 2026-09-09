import { ConnectionOptions } from 'tls';
import { TcpSocketConnectOpts } from 'net';

/**
 * RabbitMQ 连接地址的结构化描述（RmqOptions.urls 的元素类型）。
 * 相比直接使用连接字符串，对象形式更利于类型检查；
 * 字段含义与 AMQP URL 查询参数一一对应：
 * - protocol/hostname/port/vhost：连接协议、主机、端口与虚拟主机；
 * - username/password：认证凭据；
 * - locale/frameMax/heartbeat：AMQP 连接协商参数（语言、最大帧字节数、心跳秒数）。
 *
 * @publicApi
 */
export interface RmqUrl {
  protocol?: string;
  hostname?: string;
  port?: number;
  username?: string;
  password?: string;
  locale?: string;
  frameMax?: number;
  heartbeat?: number;
  vhost?: string;
}

/**
 * AMQP 连接的客户端属性（如 connectionName，会显示在 broker 的
 * 连接列表中，便于排查问题）。
 */
interface ClientProperties {
  connectionName?: string;
  [key: string]: any;
}

/**
 * AMQP 底层 socket 连接选项：由 TLS 选项或 TCP 连接选项扩展而来，
 * 增加 noDelay（禁用 Nagle）、keepAlive（TCP 保活）、timeout（连接超时）
 * 与 AMQP SASL 认证凭据 credentials 等字段。
 */
type AmqpConnectionOptions = (ConnectionOptions | TcpSocketConnectOpts) & {
  noDelay?: boolean;
  timeout?: number;
  keepAlive?: boolean;
  keepAliveDelay?: number;
  clientProperties?: any;
  credentials?:
    | {
        mechanism: string;
        username: string;
        password: string;
        response: () => Buffer;
      }
    | {
        mechanism: string;
        response: () => Buffer;
      }
    | undefined;
};

/**
 * amqp-connection-manager 的 socket 级连接选项
 * （RmqOptions.socketOptions 的类型）：
 * - reconnectTimeInSeconds：断开后重连间隔（秒）；
 * - heartbeatIntervalInSeconds：AMQP 心跳间隔（秒）；
 * - findServers：动态返回 broker 地址列表的函数（用于服务发现场景）；
 * - connectionOptions：底层 AMQP socket 连接选项；
 * - clientProperties：连接的客户端属性（如连接名）。
 *
 * @publicApi
 */
export interface AmqpConnectionManagerSocketOptions {
  reconnectTimeInSeconds?: number;
  heartbeatIntervalInSeconds?: number;
  findServers?: () => string | string[];
  connectionOptions?: AmqpConnectionOptions;
  clientProperties?: ClientProperties;
  [key: string]: any;
}

/**
 * RabbitMQ 队列断言（assertQueue）选项（RmqOptions.queueOptions 的类型）：
 * - durable：队列是否持久化（broker 重启后保留）；
 * - autoDelete：最后一个消费者断开后是否自动删除队列；
 * - messageTtl/expires：消息/队列的过期时间（毫秒）；
 * - deadLetterExchange/deadLetterRoutingKey：死信交换机与路由键；
 * - maxLength/maxPriority：队列最大长度与优先级队列支持。
 *
 * @publicApi
 */
export interface AmqplibQueueOptions {
  durable?: boolean;
  autoDelete?: boolean;
  arguments?: any;
  messageTtl?: number;
  expires?: number;
  deadLetterExchange?: string;
  deadLetterRoutingKey?: string;
  maxLength?: number;
  maxPriority?: number;
  [key: string]: any;
}
