import { Serializer } from '../interfaces/serializer.interface';

/**
 * 恒等序列化器（Identity Serializer）。
 *
 * 对待发送的数据不做任何转换，原样返回。通常在消息出站前已由
 * Socket/TCP 层完成 JSON 序列化的传输器（如 TCP、Redis）中作为默认序列化器。
 */
export class IdentitySerializer implements Serializer {
  /**
   * 直接返回原始值，不进行任何序列化处理。
   * @param value - 待发送的消息负载
   * @returns 原样返回的 value
   */
  serialize(value: any) {
    return value;
  }
}
