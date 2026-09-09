import { Deserializer } from '../interfaces/deserializer.interface';

/**
 * 恒等反序列化器（Identity Deserializer）。
 *
 * 对传入的数据不做任何转换，原样返回。通常用作默认的反序列化器，
 * 或在消息负载本身已是业务可识别结构（如 TCP 的 JSON 解析已完成）时使用。
 *
 * @publicApi
 */
export class IdentityDeserializer implements Deserializer {
  /**
   * 直接返回原始值，不进行任何反序列化处理。
   * @param value - 原始消息负载
   * @returns 原样返回的 value
   */
  deserialize(value: any) {
    return value;
  }
}
