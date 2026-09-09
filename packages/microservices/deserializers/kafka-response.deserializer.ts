import { isUndefined } from '@nestjs/common/utils/shared.utils';
import { KafkaHeaders } from '../enums/kafka-headers.enum';
import { Deserializer, IncomingResponse } from '../interfaces';

/**
 * Kafka 响应反序列化器。
 *
 * 在客户端侧将 Kafka 消费到的服务端响应记录解析为统一的 `IncomingResponse`
 * 结构。Kafka 协议下 Nest 的元信息（关联 id、错误标记、终结标记）放在
 * 消息头（headers）中，业务负载放在消息体（value）中：
 * - 头中带 NEST_ERR 表示响应为错误；
 * - 头中带 NEST_IS_DISPOSED 表示响应流已终结（可用于支持 Observable 多值流）；
 * - 都没有则视为流中尚未终结的一个中间值。
 *
 * @publicApi
 */
export class KafkaResponseDeserializer implements Deserializer<
  any,
  IncomingResponse
> {
  /**
   * 反序列化 Kafka 响应记录。
   * @param message - Kafka 消费到的响应记录（含 headers 与 value）
   * @param options - 反序列化选项（本实现未使用）
   * @returns 标准化的 IncomingResponse 对象（含 id、response/err、isDisposed）
   */
  deserialize(message: any, options?: Record<string, any>): IncomingResponse {
    // 1. 从消息头提取关联 id，用于匹配客户端中待完成的请求
    const id = message.headers[KafkaHeaders.CORRELATION_ID].toString();
    // 2. 头中带错误标记：构造错误响应并标记终结
    if (!isUndefined(message.headers[KafkaHeaders.NEST_ERR])) {
      return {
        id,
        err: message.headers[KafkaHeaders.NEST_ERR],
        isDisposed: true,
      };
    }
    // 3. 头中带终结标记：正常响应且响应流到此结束
    if (!isUndefined(message.headers[KafkaHeaders.NEST_IS_DISPOSED])) {
      return {
        id,
        response: message.value,
        isDisposed: true,
      };
    }
    // 4. 普通中间值：响应流尚未终结（Observable 可能还有后续值）
    return {
      id,
      response: message.value,
      isDisposed: false,
    };
  }
}
