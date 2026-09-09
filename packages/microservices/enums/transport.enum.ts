/**
 * 微服务传输层类型枚举：
 * ServerFactory 与 ClientProxyFactory 根据该枚举值选择对应的
 * 服务端（Server*）与客户端（Client*）实现。
 */
export enum Transport {
  TCP,
  REDIS,
  NATS,
  MQTT,
  GRPC,
  RMQ,
  KAFKA,
}
