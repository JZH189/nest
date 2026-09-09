import {
  OutgoingEvent,
  OutgoingRequest,
  OutgoingResponse,
} from './packet.interface';

/**
 * 序列化器通用接口：把消息包转换为传输层可发送的格式。
 * 各传输器有各自的默认实现（如 KafkaRequestSerializer、RmqRecordSerializer），
 * 也可通过 options.serializer 自定义。
 *
 * @publicApi
 * @typeParam TInput - 待序列化的消息包
 * @typeParam TOutput - 传输层格式（字符串/Buffer/消息对象等）
 */
export interface Serializer<TInput = any, TOutput = any> {
  /**
   * 序列化一条消息。
   * @param value 消息包
   * @param options 序列化时的附加信息（如 headers）
   * @returns 传输层格式的数据
   */
  serialize(value: TInput, options?: Record<string, any>): TOutput;
}

/** 客户端侧的序列化器：把请求/事件包序列化为传输层格式。 */
export type ProducerSerializer = Serializer<
  OutgoingEvent | OutgoingRequest,
  any
>;
/** 服务端侧的序列化器：把响应包序列化为传输层格式。 */
export type ConsumerSerializer = Serializer<OutgoingResponse, any>;
