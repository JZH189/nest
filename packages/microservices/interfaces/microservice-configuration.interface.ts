import { InjectionToken, Type } from '@nestjs/common';
import { TlsOptions } from 'tls';
import { Transport } from '../enums/transport.enum';
import { ChannelOptions } from '../external/grpc-options.interface';
import {
  ConsumerConfig,
  ConsumerRunConfig,
  ConsumerSubscribeTopics,
  KafkaConfig,
  ProducerConfig,
  ProducerRecord,
} from '../external/kafka.interface';
import { MqttClientOptions, QoS } from '../external/mqtt-options.interface';
import { IORedisOptions } from '../external/redis.interface';
import {
  AmqpConnectionManagerSocketOptions,
  AmqplibQueueOptions,
  RmqUrl,
} from '../external/rmq-url.interface';
import { TcpSocket } from '../helpers';
import { CustomTransportStrategy } from './custom-transport-strategy.interface';
import { Deserializer } from './deserializer.interface';
import { Serializer } from './serializer.interface';

/**
 * 微服务配置的联合类型：createMicroservice()/connectMicroservice()
 * 的入参，按 transport 字段区分传输器（gRPC/TCP/Redis/NATS/MQTT/RMQ/Kafka），
 * 或使用自定义传输策略（CustomStrategy）。
 */
export type MicroserviceOptions =
  | GrpcOptions
  | TcpOptions
  | RedisOptions
  | NatsOptions
  | MqttOptions
  | RmqOptions
  | KafkaOptions
  | CustomStrategy;

/**
 * 传输器标识类型：内置传输器枚举值或自定义传输器的 Symbol 标识
 * （用于多实例场景下区分不同的传输层实现）。
 */
export type TransportId = Transport | symbol;

/**
 * 异步微服务配置：通过注入令牌与工厂函数动态生成 MicroserviceOptions。
 */
export type AsyncMicroserviceOptions = {
  /** 工厂函数的依赖注入令牌列表。 */
  inject: InjectionToken[];
  /** 返回微服务配置的工厂函数。 */
  useFactory: (...args: any[]) => MicroserviceOptions;
};

/**
 * 通用异步选项类型：通过注入令牌与工厂函数动态生成任意选项对象 T。
 */
export type AsyncOptions<T extends object> = {
  /** 工厂函数的依赖注入令牌列表。 */
  inject: InjectionToken[];
  /** 返回选项对象的工厂函数。 */
  useFactory: (...args: any[]) => T;
};

/**
 * 自定义传输策略配置：strategy 为实现了 CustomTransportStrategy 接口的
 * 实例（由用户自行接管监听逻辑），options 为随策略传递的选项。
 *
 * @publicApi
 */
export interface CustomStrategy {
  strategy: CustomTransportStrategy;
  options?: Record<string, any>;
}

/**
 * gRPC 传输器配置（transport: Transport.GRPC）。
 * 关键字段：
 * - protoPath/package：.proto 文件路径与 proto 包名（必填 package）；
 * - url：监听地址（默认 '0.0.0.0:5000'）；
 * - protoLoader/protoDefinition：proto 加载器与自定义包定义；
 * - credentials：服务端凭据（TLS 等）；
 * - loader：透传给 proto-loader 的解析选项（keepCase/oneofs 等）；
 * - maxSendMessageLength/maxReceiveMessageLength/maxMetadataSize：消息长度限制；
 * - channelOptions/keepalive：gRPC 通道与 keepalive 参数；
 * - gracefulShutdown：关闭时是否优雅等待在途请求。
 *
 * @publicApi
 */
export interface GrpcOptions {
  transport?: Transport.GRPC;
  options: {
    url?: string;
    maxSendMessageLength?: number;
    maxReceiveMessageLength?: number;
    maxMetadataSize?: number;
    keepalive?: {
      keepaliveTimeMs?: number;
      keepaliveTimeoutMs?: number;
      keepalivePermitWithoutCalls?: number;
      http2MaxPingsWithoutData?: number;
      http2MinTimeBetweenPingsMs?: number;
      http2MinPingIntervalWithoutDataMs?: number;
      http2MaxPingStrikes?: number;
    };
    channelOptions?: ChannelOptions;
    credentials?: any;
    protoPath?: string | string[];
    package: string | string[];
    protoLoader?: string;
    packageDefinition?: any;
    gracefulShutdown?: boolean;
    onLoadPackageDefinition?: (pkg: any, server: any) => void;
    loader?: {
      keepCase?: boolean;
      alternateCommentMode?: boolean;
      longs?: Function;
      enums?: Function;
      bytes?: Function;
      defaults?: boolean;
      arrays?: boolean;
      objects?: boolean;
      oneofs?: boolean;
      json?: boolean;
      includeDirs?: string[];
    };
  };
}

/**
 * TCP 传输器配置（transport: Transport.TCP，默认传输器）。
 * 关键字段：
 * - host/port：监听地址与端口（默认 localhost:3000）；
 * - retryAttempts/retryDelay：意外关闭后的自动重启次数与间隔；
 * - socketClass：自定义 socket 包装类（默认 JsonSocket）；
 * - tlsOptions：启用 TLS 的选项；
 * - maxBufferSize：单条消息最大缓冲（防止超大消息耗尽内存）。
 *
 * @publicApi
 */
export interface TcpOptions {
  transport?: Transport.TCP;
  options?: {
    host?: string;
    port?: number;
    retryAttempts?: number;
    retryDelay?: number;
    serializer?: Serializer;
    tlsOptions?: TlsOptions;
    deserializer?: Deserializer;
    socketClass?: Type<TcpSocket>;
    /**
     * 最大缓冲区大小（以字符为单位）（默认：128MB 字符，即 (512 * 1024 * 1024) / 4）。
     * 此限制可防止接收大型 TCP 消息时内存耗尽。
     */
    maxBufferSize?: number;
  };
}

/**
 * Redis Pub/Sub 传输器配置（transport: Transport.REDIS）。
 * 基于 Redis 频道（Pub/Sub）实现 RPC 与事件分发，
 * 关键字段：
 * - host/port：Redis 服务器地址（默认 localhost:6379）；
 * - wildcards：启用 psubscribe 通配符订阅；
 * - retryAttempts/retryDelay：断线重连次数与间隔；
 * - 其余字段透传给 ioredis（IORedisOptions）。
 *
 * @publicApi
 */
export interface RedisOptions {
  transport?: Transport.REDIS;
  options?: {
    host?: string;
    port?: number;
    retryAttempts?: number;
    retryDelay?: number;
    /**
     * 使用 `psubscribe`/`pmessage` 启用模式中的通配符。
     */
    wildcards?: boolean;
    serializer?: Serializer;
    deserializer?: Deserializer;
  } & IORedisOptions;
}

/**
 * MQTT 传输器配置（transport: Transport.MQTT）。
 * 基于 MQTT topic 实现消息分发，关键字段：
 * - url：broker 地址（默认 'tcp://localhost:1883'）；
 * - subscribeOptions：订阅选项（qos、nl、rap、rh）；
 * - userProperties：MQTT 5.0 用户属性；
 * - 其余字段透传给 MQTT.js（MqttClientOptions）。
 *
 * @publicApi
 */
export interface MqttOptions {
  transport?: Transport.MQTT;
  options?: MqttClientOptions & {
    url?: string;
    serializer?: Serializer;
    deserializer?: Deserializer;
    subscribeOptions?: {
      /**
       * QoS 等级
       */
      qos: QoS;
      /*
       * 无本地标志
       * */
      nl?: boolean;
      /*
       * 保留为已发布标志
       * */
      rap?: boolean;
      /*
       * 保留处理选项
       * */
      rh?: number;
    };
    userProperties?: Record<string, string | string[]>;
  };
}

/**
 * NATS 传输器配置（transport: Transport.NATS）。
 * 基于 NATS subject 实现消息分发，关键字段：
 * - servers：NATS 服务器地址列表；
 * - queue：队列组名称（同一队列组的订阅者负载均衡消费）；
 * - authenticator/user/pass/token/userJWT/userCreds/nkey：认证相关；
 * - reconnect*：断线重连策略；gracefulShutdown/gracePeriod：优雅关闭；
 * - serializer/deserializer：消息编解码器。
 *
 * @publicApi
 */
export interface NatsOptions {
  transport?: Transport.NATS;
  options?: {
    headers?: Record<string, string>;
    authenticator?: any;
    debug?: boolean;
    ignoreClusterUpdates?: boolean;
    inboxPrefix?: string;
    encoding?: string;
    name?: string;
    user?: string;
    pass?: string;
    maxPingOut?: number;
    maxReconnectAttempts?: number;
    reconnectTimeWait?: number;
    reconnectJitter?: number;
    reconnectJitterTLS?: number;
    reconnectDelayHandler?: any;
    servers?: string[] | string;
    nkey?: any;
    reconnect?: boolean;
    pedantic?: boolean;
    tls?: any;
    queue?: string;
    serializer?: Serializer;
    deserializer?: Deserializer;
    userJWT?: string;
    nonceSigner?: any;
    userCreds?: any;
    useOldRequestStyle?: boolean;
    pingInterval?: number;
    preserveBuffers?: boolean;
    waitOnFirstConnect?: boolean;
    verbose?: boolean;
    noEcho?: boolean;
    noRandomize?: boolean;
    timeout?: number;
    token?: string;
    yieldTime?: number;
    tokenHandler?: any;
    gracefulShutdown?: boolean;
    gracePeriod?: number;
    [key: string]: any;
  };
}

/**
 * RabbitMQ 传输器配置（transport: Transport.RMQ）。
 * 基于 AMQP 队列/交换机实现消息分发，字段含义见各属性注释。
 *
 * @publicApi
 */
export interface RmqOptions {
  transport?: Transport.RMQ;
  options?: {
    /**
     * 按顺序尝试的连接 URL 数组。
     */
    urls?: string[] | RmqUrl[];
    /**
     * 队列名称。
     */
    queue?: string;
    /**
     * 此频道的预取计数。给定的计数是可以通过频道发送的最大消息数，这些消息可能正在等待确认；
     * 一旦有 count 条消息未完成，服务器将不会在此频道上发送更多消息，直到有一条或多条消息被确认。
     */
    prefetchCount?: number;
    /**
     * 设置预取消息的每频道行为。
     */
    isGlobalPrefetchCount?: boolean;
    /**
     * Amqplib 队列选项。
     * @see https://amqp-node.github.io/amqplib/channel_api.html#channel_assertQueue
     */
    queueOptions?: AmqplibQueueOptions;
    /**
     * AMQP 连接管理器套接字选项。
     */
    socketOptions?: AmqpConnectionManagerSocketOptions;
    /**
     * 如果为 true，代理不会期望对传递到此消费者的消息进行确认；即，一旦消息被发送到网络上，它就会立即出队。
     * @default false
     */
    noAck?: boolean;
    /**
     * 服务器将用于区分此消费者的消息传递的名称；不能在频道上已经使用。通常更容易省略此选项，
     * 在这种情况下，服务器将创建一个随机名称并在回复中提供它。
     */
    consumerTag?: string;
    /**
     * 消息负载的序列化器。
     */
    serializer?: Serializer;
    /**
     * 消息负载的反序列化器。
     */
    deserializer?: Deserializer;
    /**
     * 生产者的回复队列。
     * @default 'amq.rabbitmq.reply-to'
     */
    replyQueue?: string;
    /**
     * 如果为真，只要消息所在的队列也能在重启后存活，消息将在代理重启后保留。
     */
    persistent?: boolean;
    /**
     * 每条消息发送的额外头信息。
     * 仅适用于生产者配置。
     */
    headers?: Record<string, string>;
    /**
     * 当为 false 时，队列将在消费前不会被断言。
     * @default false
     */
    noAssert?: boolean;
    /**
     * 交换区名称。当 "wildcards" 设置为 true 时，默认为队列名称。
     * @default ''
     */
    exchange?: string;
    /**
     * 交换区类型。
     * 接受 AMQP 标准类型（'direct'、'fanout'、'topic'、'headers'）或作为字符串字面量提供的任何自定义交换区类型名称。
     * @default 'topic'
     */
    exchangeType?: 'direct' | 'fanout' | 'topic' | 'headers' | (string & {});
    /**
     * 交换区参数
     */
    exchangeArguments?: Record<string, string>;
    /**
     * 主题交换的附加路由键。
     */
    routingKey?: string;
    /**
     * 仅在你想使用主题交换来路由消息到队列时设置为 true。
     * 启用此选项将允许你使用通配符 (*, #) 作为消息和事件模式。
     * @see https://www.rabbitmq.com/tutorials/tutorial-five-python#topic-exchange
     * @default false
     */
    wildcards?: boolean;
    /**
     * 最大连接尝试次数。
     * 仅适用于消费者配置。
     * -1 === 无限
     * @default -1
     */
    maxConnectionAttempts?: number;
  };
}

/**
 * @publicApi
 */
/** Kafka 消息解析器配置：keepBinary 为 true 时保留原始二进制负载不转字符串。 */
export interface KafkaParserConfig {
  keepBinary?: boolean;
}

/**
/**
 * Kafka 传输器配置（transport: Transport.KAFKA）。
 * 基于 Kafka topic 实现消息分发，关键字段：
 * - client：kafkajs 客户端配置（brokers、clientId、认证等）；
 * - consumer/producer：消费者与生产者配置；
 * - run/subscribe/send：透传给 consumer.run()、subscribe() 与 producer.send() 的选项；
 * - postfixId：clientId/groupId 自动追加的后缀（避免客户端/服务端冲突）；
 * - producerOnlyMode：仅作为生产者使用（不订阅消费）；
 * - parser：消息解析器配置。
 *
 * @publicApi
 */
export interface KafkaOptions {
  transport?: Transport.KAFKA;
  options?: {
    /**
     * 默认为服务器端的 `"-server"` 和客户端的 `"-client"`。
     */
    postfixId?: string;
    client?: KafkaConfig;
    consumer?: ConsumerConfig;
    /**
     * 传递给 KafkaJS consumer.run() 的选项。
     * 注意：`partitionsConsumedConcurrently`（KafkaJS 参数）控制在分区级别（而非主题级别）的并发处理。
     */
    run?: Omit<ConsumerRunConfig, 'eachBatch' | 'eachMessage'>;
    subscribe?: Omit<ConsumerSubscribeTopics, 'topics'>;
    producer?: ProducerConfig;
    send?: Omit<ProducerRecord, 'topic' | 'messages'>;
    serializer?: Serializer;
    deserializer?: Deserializer;
    parser?: KafkaParserConfig;
    producerOnlyMode?: boolean;
  };
}
