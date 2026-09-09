import { Consumer, KafkaMessage, Producer } from '../external/kafka.interface';
import { BaseRpcContext } from './base-rpc.context';

type KafkaContextArgs = [
  message: KafkaMessage,
  partition: number,
  topic: string,
  consumer: Consumer,
  heartbeat: () => Promise<void>,
  producer: Producer,
];

/**
 * Kafka 传输层的 RPC 上下文宿主。
 * args 约定：[原始消息, 分区号, 主题名, consumer, 心跳回调, producer]。
 * 在处理器中通过 @Ctx() 注入后可访问 Kafka 消息原文（headers/offset 等）、
 * 手动提交 offset 所需的 consumer/producer 以及心跳方法。
 *
 * @publicApi
 */
export class KafkaContext extends BaseRpcContext<KafkaContextArgs> {
  constructor(args: KafkaContextArgs) {
    super(args);
  }

  /**
   * 返回原始 Kafka 消息（含 value、headers、offset、key 等）。
   */
  getMessage() {
    return this.args[0];
  }

  /**
   * 返回消息所在分区号。
   */
  getPartition() {
    return this.args[1];
  }

  /**
   * 返回主题（topic）名称。
   */
  getTopic() {
    return this.args[2];
  }

  /**
   * 返回 Kafka consumer 引用（可用于手动 commitOffsets）。
   */
  getConsumer() {
    return this.args[3];
  }

  /**
   * 返回 Kafka 心跳回调（保持消费组成员资格）。
   */
  getHeartbeat() {
    return this.args[4];
  }

  /**
   * 返回 Kafka producer 引用（可用于向其他主题发送消息）。
   */
  getProducer() {
    return this.args[5];
  }
}
