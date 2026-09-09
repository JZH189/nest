import {
  isNil,
  isObject,
  isPlainObject,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { Serializer } from '../interfaces/serializer.interface';

/**
 * Kafka 请求记录结构：对应 KafkaJS 生产者可接受的消息格式。
 * key 用于分区路由；value 为实际负载；headers 携带 Nest 元信息（如关联 id）。
 */
export interface KafkaRequest<T = any> {
  key: Buffer | string | null;
  value: T;
  headers: Record<string, any>;
}

/**
 * Kafka 请求序列化器。
 *
 * 在客户端/服务端发送消息时，把 Nest 内部的消息包编码为 KafkaJS 可接受的
 * `KafkaRequest` 记录：非 Kafka 结构的裸数据会被包装为 `{ value }`，
 * 负载与 key 会被编码为 JSON 字符串或 Buffer，headers 保证存在（默认空对象）。
 *
 * @publicApi
 */
export class KafkaRequestSerializer implements Serializer<
  any,
  KafkaRequest | Promise<KafkaRequest>
> {
  /**
   * 将任意消息值编码为 Kafka 请求记录。
   * @param value - 待发送的消息值，可以是裸数据或已含 key/value/headers 的对象
   * @returns 符合 KafkaJS 生产者格式的 KafkaRequest 记录
   */
  serialize(value: any) {
    // 1. 判断是否为 Kafka 消息结构：缺少 key/value 字段则视为裸数据，包装为 { value }
    const isNotKafkaMessage =
      isNil(value) ||
      !isObject(value) ||
      (!('key' in value) && !('value' in value));

    if (isNotKafkaMessage) {
      value = { value };
    }
    // 2. 编码消息体（业务负载）
    value.value = this.encode(value.value);
    // 3. 若存在消息 key，也一并编码
    if (!isNil(value.key)) {
      value.key = this.encode(value.key);
    }
    // 4. 保证 headers 字段存在（后续写入关联 id 等 Nest 元信息时依赖它）
    if (isNil(value.headers)) {
      value.headers = {};
    }
    return value;
  }

  /**
   * 将任意值编码为 Kafka 可传输的格式（JSON 字符串、字符串或 Buffer）。
   * @param value - 待编码的值
   * @returns 编码结果：普通对象/数组/类实例为 JSON 字符串（或 toString 结果），
   *          undefined 转为 null，其余（字符串、Buffer）原样返回
   */
  public encode(value: any): Buffer | string | null {
    // 1. 判断是否为对象或数组（非空、非字符串、非 Buffer）
    const isObjectOrArray =
      !isNil(value) && !isString(value) && !Buffer.isBuffer(value);

    if (isObjectOrArray) {
      // 2. 纯对象、数组或未经自定义 toString 的类实例走 JSON.stringify；
      //    其他对象调用 toString()（防止默认的 [object Object] 行为）
      return isPlainObject(value) ||
        Array.isArray(value) ||
        value.toString == Object.prototype.toString // Prevent default [object Object] behavior
        ? JSON.stringify(value)
        : value.toString();
    } else if (isUndefined(value)) {
      // 3. undefined 转为 null，避免 KafkaJS 报错
      return null;
    }
    return value;
  }
}
