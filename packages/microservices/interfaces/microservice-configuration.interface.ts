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

export type MicroserviceOptions =
  | GrpcOptions
  | TcpOptions
  | RedisOptions
  | NatsOptions
  | MqttOptions
  | RmqOptions
  | KafkaOptions
  | CustomStrategy;

export type TransportId = Transport | symbol;

export type AsyncMicroserviceOptions = {
  inject: InjectionToken[];
  useFactory: (...args: any[]) => MicroserviceOptions;
};

export type AsyncOptions<T extends object> = {
  inject: InjectionToken[];
  useFactory: (...args: any[]) => T;
};

/**
 * @publicApi
 */
export interface CustomStrategy {
  strategy: CustomTransportStrategy;
  options?: Record<string, any>;
}

/**
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
export interface KafkaParserConfig {
  keepBinary?: boolean;
}

/**
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
