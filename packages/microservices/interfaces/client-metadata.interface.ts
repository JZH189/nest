import { Type } from '@nestjs/common';
import { ConnectionOptions } from 'tls';
import { ClientProxy } from '../client';
import { Transport } from '../enums/transport.enum';
import { TcpSocket } from '../helpers';
import { Deserializer } from './deserializer.interface';
import {
  GrpcOptions,
  KafkaOptions,
  MqttOptions,
  NatsOptions,
  RedisOptions,
  RmqOptions,
} from './microservice-configuration.interface';
import { Serializer } from './serializer.interface';

/**
 * 客户端配置联合类型：connectMicroservice()/ClientsModule 接受的配置，
 * 覆盖全部内置传输器（Redis/NATS/MQTT/gRPC/Kafka/TCP/RMQ）。
 * 按 transport 字段区分，具体选项见 MicroserviceOptions 中各传输器的 Options。
 */
export type ClientOptions =
  | RedisOptions
  | NatsOptions
  | MqttOptions
  | GrpcOptions
  | KafkaOptions
  | TcpClientOptions
  | RmqOptions;

/**
 * 自定义客户端配置：customClass 指定一个继承 ClientProxy 的类，
 * 由 ClientProxyFactory 实例化（options 传入其构造函数）。
 *
 * @publicApi
 */
export interface CustomClientOptions {
  /** 自定义的 ClientProxy 实现类。 */
  customClass: Type<ClientProxy>;
  /** 传给自定义客户端的选项。 */
  options?: Record<string, any>;
}

/**
 * TCP 客户端配置（transport: Transport.TCP）。
 * 与服务端 ServerTCP 的选项对应：host/port 指定连接目标，
 * socketClass 自定义 socket 包装类，tlsOptions 启用 TLS 连接。
 *
 * @publicApi
 */
export interface TcpClientOptions {
  transport: Transport.TCP;
  options?: {
    host?: string;
    port?: number;
    serializer?: Serializer;
    deserializer?: Deserializer;
    tlsOptions?: ConnectionOptions;
    socketClass?: Type<TcpSocket>;
    /**
     * 最大缓冲区大小（以字符为单位）（默认：128MB 字符，即 (512 * 1024 * 1024) / 4）。
     * 此限制可防止接收大型 TCP 消息时内存耗尽。
     */
    maxBufferSize?: number;
  };
}
