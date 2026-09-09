import {
  IncomingEvent,
  IncomingRequest,
  IncomingResponse,
} from './packet.interface';

/**
 * 反序列化器通用接口：把传输层收到的原始数据解析为消息包。
 * 各传输器有各自的默认实现（如 IncomingRequestDeserializer、
 * KafkaRequestDeserializer），也可通过 options.deserializer 自定义。
 *
 * @publicApi
 * @typeParam TInput - 原始输入数据类型
 * @typeParam TOutput - 反序列化输出类型（消息包）
 */
export interface Deserializer<TInput = any, TOutput = any> {
  /**
   * 反序列化一条消息。
   * @param value 原始数据（字符串/Buffer/消息对象等）
   * @param options 反序列化时的附加信息（如 channel、headers）
   * @returns 消息包（同步或 Promise）
   */
  deserialize(
    value: TInput,
    options?: Record<string, any>,
  ): TOutput | Promise<TOutput>;
}

/** 客户端侧的反序列化器：把收到的原始数据解析为响应包（IncomingResponse）。 */
export type ProducerDeserializer = Deserializer<any, IncomingResponse>;
/**
 * 服务端侧的反序列化器：把收到的原始数据解析为
 * 请求包（IncomingRequest）或事件包（IncomingEvent）。
 */
export type ConsumerDeserializer = Deserializer<
  any,
  IncomingRequest | IncomingEvent
>;
