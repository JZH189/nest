import { RpcException } from './rpc-exception';

/**
 * 此异常指示 Kafka 驱动程序不要内省错误处理流程并向消费者发送序列化的错误消息，
 * 而是强制将其冒泡到底层 "kafkajs" 包的 "eachMessage" 回调中
 *（即使应用了拦截器，或消息处理程序返回了可观察流）。
 *
 * 一个临时异常，重试可能会成功。
 *
 * @publicApi
 */
export class KafkaRetriableException extends RpcException {
  public getError(): string | object {
    return this;
  }
}
