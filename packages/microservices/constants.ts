import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

/**
 * microservices 包的常量集合，包含三类内容：
 * 1. 各传输层（TCP/Redis/NATS/MQTT/gRPC/RMQ/Kafka）的默认连接配置；
 * 2. 常见连接错误码，用于判断是否需要自动重连；
 * 3. 装饰器写入的元数据键（metadata key），供监听器元数据探索器（ListenerMetadataExplorer）读取。
 */

/** TCP 服务端默认监听端口 */
export const TCP_DEFAULT_PORT = 3000;
/** TCP 默认监听主机 */
export const TCP_DEFAULT_HOST = 'localhost';
/** Redis 微服务默认端口 */
export const REDIS_DEFAULT_PORT = 6379;
/** Redis 微服务默认主机 */
export const REDIS_DEFAULT_HOST = 'localhost';
/** NATS 默认连接地址 */
export const NATS_DEFAULT_URL = 'nats://localhost:4222';
/** MQTT 默认连接地址（broker URL） */
export const MQTT_DEFAULT_URL = 'mqtt://localhost:1883';
/** gRPC 默认监听地址（host:port） */
export const GRPC_DEFAULT_URL = 'localhost:5000';
/** RMQ（amqp）默认连接地址 */
export const RQM_DEFAULT_URL = 'amqp://localhost';
/** Kafka 默认 broker 地址 */
export const KAFKA_DEFAULT_BROKER = 'localhost:9092';
/** Kafka 默认客户端 ID */
export const KAFKA_DEFAULT_CLIENT = 'nestjs-consumer';
/** Kafka 默认消费者组 */
export const KAFKA_DEFAULT_GROUP = 'nestjs-group';
/** MQTT 主题（topic）层级分隔符 */
export const MQTT_SEPARATOR = '/';
/** MQTT 单层通配符（匹配一个层级） */
export const MQTT_WILDCARD_SINGLE = '+';
/** MQTT 多层通配符（匹配任意层级） */
export const MQTT_WILDCARD_ALL = '#';
/** RMQ 默认队列名（空字符串表示使用默认交换机行为） */
export const RQM_DEFAULT_QUEUE = '';
/** RMQ 默认 prefetch（预取）数量 */
export const RQM_DEFAULT_PREFETCH_COUNT = 0;
/** RMQ prefetch 是否为全局（作用于整个 channel 而非单个 consumer） */
export const RQM_DEFAULT_IS_GLOBAL_PREFETCH_COUNT = false;
/** RMQ 队列声明时的额外选项（如 durable、exclusive 等） */
export const RQM_DEFAULT_QUEUE_OPTIONS = {};
/** RMQ 默认是否自动 ack（noAck = true 表示消费后无需显式确认） */
export const RQM_DEFAULT_NOACK = true;
/** RMQ 消息默认是否持久化 */
export const RQM_DEFAULT_PERSISTENT = false;
/** RMQ 默认是否跳过队列断言（assert） */
export const RQM_DEFAULT_NO_ASSERT = false;
/** RMQ 路由键层级分隔符 */
export const RMQ_SEPARATOR = '.';
/** RMQ 单词通配符（匹配一个单词） */
export const RMQ_WILDCARD_SINGLE = '*';
/** RMQ 多词通配符（匹配零个或多个单词） */
export const RMQ_WILDCARD_ALL = '#';

/** 连接被拒绝错误码，用于客户端判断是否进入重连逻辑 */
export const ECONNREFUSED = 'ECONNREFUSED';
/** MQTT 连接错误错误码 */
export const CONN_ERR = 'CONN_ERR';
/** 地址已被占用错误码（常见于 TCP 服务端端口冲突） */
export const EADDRINUSE = 'EADDRINUSE';
/** 域名解析失败错误码 */
export const ENOTFOUND = 'ENOTFOUND';

/** @MessagePattern / @EventPattern 装饰器存储消息模式（pattern）的元数据键 */
export const PATTERN_METADATA = 'microservices:pattern';
/** 存储模式额外信息的元数据键（如 @MessagePattern 的 options，例如 rawKafkaMessage 等） */
export const PATTERN_EXTRAS_METADATA = 'microservices:pattern_extras';
/** 存储指定传输层类型（Transport 枚举值）的元数据键 */
export const TRANSPORT_METADATA = 'microservices:transport';
/** @Client 装饰器存储客户端配置的元数据键 */
export const CLIENT_CONFIGURATION_METADATA = 'microservices:client';
/** 存储模式处理器类型（消息/事件，见 PatternHandler 枚举）的元数据键 */
export const PATTERN_HANDLER_METADATA = 'microservices:handler_type';
/** 标记属性是否为 @Client 注入的客户端实例的元数据键 */
export const CLIENT_METADATA = 'microservices:is_client_instance';
/** 参数装饰器（@Ctx、@Payload 等）存储参数信息的元数据键，与 HTTP 路由参数共用同一键 */
export const PARAM_ARGS_METADATA = ROUTE_ARGS_METADATA;
/** 存储请求模式（用于请求-响应式消息）的元数据键 */
export const REQUEST_PATTERN_METADATA = 'microservices:request_pattern';
/** 存储响应模式（用于回传响应消息）的元数据键 */
export const REPLY_PATTERN_METADATA = 'microservices:reply_pattern';

/**
 * 错误消息模板（标签函数）：RMQ 收到不匹配的事件消息时的提示。
 * @param text - 模板字符串字面量部分（未使用，仅为标签函数签名）
 * @param pattern - 未匹配到处理器的事件模式
 * @returns 提示该事件已被 negative acknowledged、不会被重新投递的错误文本
 */
export const RQM_NO_EVENT_HANDLER = (
  text: TemplateStringsArray,
  pattern: string,
) =>
  `An unsupported event was received. It has been negative acknowledged, so it will not be re-delivered. Pattern: ${pattern}`;
/**
 * 错误消息模板（标签函数）：RMQ 收到不匹配的消息（请求-响应式）时的提示。
 * @param text - 模板字符串字面量部分（未使用）
 * @param pattern - 未匹配到处理器的消息模式
 * @returns 提示该消息已被 negative acknowledged 的错误文本
 */
export const RQM_NO_MESSAGE_HANDLER = (
  text: TemplateStringsArray,
  pattern: string,
) =>
  `An unsupported message was received. It has been negative acknowledged, so it will not be re-delivered. Pattern: ${pattern}`;
/** gRPC 默认使用的 proto 加载库 */
export const GRPC_DEFAULT_PROTO_LOADER = '@grpc/proto-loader';

/**
 * 错误消息模板：客户端侧未找到匹配的事件处理器时抛出。
 * @param text - 模板字符串字面量部分（未使用）
 * @param pattern - 事件模式
 * @returns 提示远端服务未定义匹配事件处理器的错误文本
 */
export const NO_EVENT_HANDLER = (text: TemplateStringsArray, pattern: string) =>
  `There is no matching event handler defined in the remote service. Event pattern: ${pattern}`;
/** 客户端侧未找到匹配消息处理器时的错误文本 */
export const NO_MESSAGE_HANDLER = `There is no matching message handler defined in the remote service.`;
/** RMQ 断开连接时打印的日志文本 */
export const DISCONNECTED_RMQ_MESSAGE = `Disconnected from RMQ. Trying to reconnect.`;
/** 传输层连接失败时打印的日志文本 */
export const CONNECTION_FAILED_MESSAGE =
  'Connection to transport failed. Trying to reconnect...';
/**
 * 生成 RMQ broker 因流控（flow control）阻塞连接时的日志文本。
 * @param reason - broker 给出的阻塞原因
 * @returns 包含原因的日志文本
 */
export const BLOCKED_RMQ_MESSAGE = (reason: string) =>
  `RMQ broker has blocked the connection (flow control). Reason: ${reason}`;
/** RMQ broker 解除阻塞时打印的日志文本 */
export const UNBLOCKED_RMQ_MESSAGE = 'RMQ broker has unblocked the connection.';

/** NATS 客户端断开后重连前的默认宽限期（毫秒） */
export const NATS_DEFAULT_GRACE_PERIOD = 10000;
