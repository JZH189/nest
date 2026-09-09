import { IncomingEvent, IncomingRequest } from '../interfaces';
import { KafkaRequest } from '../serializers/kafka-request.serializer';
import { IncomingRequestDeserializer } from './incoming-request.deserializer';

/**
 * Kafka 请求反序列化器。
 *
 * 继承自 `IncomingRequestDeserializer`，针对 Kafka 消费到的记录做适配：
 * Kafka 的真实业务负载存放在记录的 `value` 字段中（可能为 Buffer 或
 * 已解码对象），路由 pattern 仍取自 options.channel（即消息的主题名）。
 *
 * @publicApi
 */
export class KafkaRequestDeserializer extends IncomingRequestDeserializer {
  /**
   * 将 Kafka 消费记录映射为标准的请求/事件结构。
   * @param data - Kafka 消费记录（含 value 字段）
   * @param options - 反序列化选项，通常包含 channel（消费的主题名，即路由 pattern）
   * @returns 标准化的 IncomingRequest 或 IncomingEvent 对象
   */
  mapToSchema(
    data: KafkaRequest,
    options?: Record<string, any>,
  ): IncomingRequest | IncomingEvent {
    // 1. 无选项时返回空的 pattern/data 占位结构
    if (!options) {
      return {
        pattern: undefined,
        data: undefined,
      };
    }
    // 2. 主题名作为路由 pattern；优先取记录的 value（实际负载），否则回退为整个记录
    return {
      pattern: options.channel,
      data: data?.value ?? data,
    };
  }
}
