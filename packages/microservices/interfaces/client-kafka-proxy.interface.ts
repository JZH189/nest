import { ClientProxy } from '../client';
import { KafkaStatus } from '../events';
import {
  Consumer,
  Producer,
  TopicPartitionOffsetAndMetadata,
} from '../external/kafka.interface';

/**
 * Kafka 客户端代理接口：在通用 ClientProxy 能力之上暴露 Kafka 特有能力。
 * Kafka 的 RPC 需要先「订阅响应 topic」才能收到回发的响应，
 * 因此使用 send() 前必须先对每个 pattern 调用 subscribeToResponseOf()。
 */
export interface ClientKafkaProxy extends Omit<
  ClientProxy<never, KafkaStatus>,
  'on'
> {
  /**
   * 底层 Kafka 消费者实例（用于订阅响应 topic）。
   */
  consumer: Consumer | null;
  /**
   * 底层 Kafka 生产者实例（用于发送请求与接收响应的注册）。
   */
  producer: Producer | null;
  /**
   * 订阅与指定 pattern 对应的响应 topic（把 pattern 注册到 reply topic 映射）。
   * 微服务间消息通信风格下必须先订阅才能使用 send()。
   * @param pattern 要订阅的消息模式
   */
  subscribeToResponseOf(pattern: unknown): void;
  /**
   * 提交指定的偏移量。
   * @param topicPartitions 携带偏移量与元数据的 topic 分区数组
   */
  commitOffsets(
    topicPartitions: TopicPartitionOffsetAndMetadata[],
  ): Promise<void>;
}
