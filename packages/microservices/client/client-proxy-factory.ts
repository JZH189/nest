import { Transport } from '../enums/transport.enum';
import { ClientKafkaProxy } from '../interfaces';
import {
  ClientOptions,
  CustomClientOptions,
  TcpClientOptions,
} from '../interfaces/client-metadata.interface';
import {
  GrpcOptions,
  KafkaOptions,
  MqttOptions,
  NatsOptions,
  RedisOptions,
  RmqOptions,
} from '../interfaces/microservice-configuration.interface';
import { ClientGrpcProxy } from './client-grpc';
import { ClientKafka } from './client-kafka';
import { ClientMqtt } from './client-mqtt';
import { ClientNats } from './client-nats';
import { ClientProxy } from './client-proxy';
import { ClientRedis } from './client-redis';
import { ClientRMQ } from './client-rmq';
import { ClientTCP } from './client-tcp';

/**
 * 客户端工厂接口：由 @Client 注入时调用，用于创建 ClientProxy 实例
 * （ListenersController 依赖此接口，测试时可替换实现）。
 */
export interface IClientProxyFactory {
  /**
   * 根据客户端配置创建客户端实例。
   * @param clientOptions - 客户端配置
   * @returns ClientProxy 实例
   */
  create(clientOptions: ClientOptions): ClientProxy;
}

/**
 * 客户端代理工厂：@Client 装饰器注入属性时被调用（ListenersController.assignClientsToProperties），
 * 根据配置中的 transport 类型实例化对应的客户端实现：
 * REDIS -> ClientRedis、NATS -> ClientNats、MQTT -> ClientMqtt、GRPC -> ClientGrpcProxy、
 * RMQ -> ClientRMQ、KAFKA -> ClientKafka，默认（TCP）-> ClientTCP。
 * 也支持 customClass 自定义客户端类。
 *
 * @publicApi
 */
export class ClientProxyFactory {
  /**
   * 按传输类型创建客户端实例（静态工厂方法，含多个重载签名以返回精确类型）。
   * 1. 若为自定义客户端选项（含 customClass），直接实例化自定义类；
   * 2. 否则按 transport 枚举 switch 分发到对应的 ClientProxy 子类；
   * 3. 未匹配到任何枚举时默认创建 ClientTCP。
   * @param clientOptions - 客户端配置（transport + options，或 customClass 自定义）
   * @returns 对应传输层的客户端实例
   */
  public static create(
    clientOptions: { transport: Transport.GRPC } & ClientOptions,
  ): ClientGrpcProxy;
  public static create(
    clientOptions: { transport: Transport.KAFKA } & ClientOptions,
  ): ClientKafkaProxy;
  public static create(clientOptions: ClientOptions): ClientProxy;
  public static create(clientOptions: CustomClientOptions): ClientProxy;
  public static create(
    clientOptions: ClientOptions | CustomClientOptions,
  ): ClientProxy | ClientGrpcProxy | ClientKafkaProxy {
    if (this.isCustomClientOptions(clientOptions)) {
      const { customClass, options } = clientOptions;
      return new customClass(options);
    }
    const { transport, options = {} } = clientOptions ?? { options: {} };
    switch (transport) {
      case Transport.REDIS:
        return new ClientRedis(
          options as Required<RedisOptions>['options'],
        ) as ClientProxy;
      case Transport.NATS:
        return new ClientNats(
          options as Required<NatsOptions>['options'],
        ) as ClientProxy;
      case Transport.MQTT:
        return new ClientMqtt(
          options as Required<MqttOptions>['options'],
        ) as ClientProxy;
      case Transport.GRPC:
        return new ClientGrpcProxy(options as GrpcOptions['options']);
      case Transport.RMQ:
        return new ClientRMQ(
          options as Required<RmqOptions>['options'],
        ) as ClientProxy;
      case Transport.KAFKA:
        return new ClientKafka(options as Required<KafkaOptions>['options']);
      default:
        return new ClientTCP(
          options as Required<TcpClientOptions>['options'],
        ) as ClientProxy;
    }
  }

  /**
   * 类型守卫：判断配置是否为自定义客户端选项（含 customClass 字段）。
   * @param options - 客户端配置
   * @returns 是否为 CustomClientOptions
   */
  private static isCustomClientOptions(
    options: ClientOptions | CustomClientOptions,
  ): options is CustomClientOptions {
    return !!(options as CustomClientOptions).customClass;
  }
}
