import { Transport } from '../enums/transport.enum';
import {
  CustomStrategy,
  KafkaOptions,
  MicroserviceOptions,
  MqttOptions,
  NatsOptions,
  RedisOptions,
  RmqOptions,
  TcpOptions,
} from '../interfaces';
import { ServerGrpc } from './server-grpc';
import { ServerKafka } from './server-kafka';
import { ServerMqtt } from './server-mqtt';
import { ServerNats } from './server-nats';
import { ServerRedis } from './server-redis';
import { ServerRMQ } from './server-rmq';
import { ServerTCP } from './server-tcp';

/**
 * 微服务服务端工厂：根据用户配置的传输器类型（transport 枚举）
 * 创建对应的 Server 传输实现实例。
 *
 * 在 NestFactory.createMicroservice() 内部被调用，
 * 例如 transport 为 Transport.KAFKA 时创建 ServerKafka。
 * 未匹配到已知传输器时默认创建 ServerTCP（TCP 是默认传输方式）。
 */
export class ServerFactory {
  /**
   * 根据微服务配置创建对应的传输层服务端实例。
   * @param microserviceOptions 微服务配置，包含 transport（传输器枚举）与 options（传输器选项）
   * @returns 与传输器类型匹配的 Server 实例（ServerTCP/ServerRedis/ServerNATS/ServerMqtt/ServerGrpc/ServerKafka/ServerRMQ）
   */
  public static create(microserviceOptions: MicroserviceOptions) {
    const { transport, options } = microserviceOptions as Exclude<
      MicroserviceOptions,
      CustomStrategy
    >;
    switch (transport) {
      case Transport.REDIS:
        return new ServerRedis(options as Required<RedisOptions>['options']);
      case Transport.NATS:
        return new ServerNats(options as Required<NatsOptions>['options']);
      case Transport.MQTT:
        return new ServerMqtt(options as Required<MqttOptions>['options']);
      case Transport.GRPC:
        return new ServerGrpc(options);
      case Transport.KAFKA:
        return new ServerKafka(options as Required<KafkaOptions>['options']);
      case Transport.RMQ:
        return new ServerRMQ(options as Required<RmqOptions>['options']);
      default:
        return new ServerTCP(options as Required<TcpOptions>['options']);
    }
  }
}
