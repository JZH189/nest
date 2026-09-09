import { isObject } from '@nestjs/common/utils/shared.utils';
import { ReadPacket, Serializer } from '../interfaces';
import { MqttRecord } from '../record-builders';

/**
 * MQTT 记录序列化器。
 *
 * 在发送消息前把 Nest 内部的消息包（ReadPacket）序列化为 MQTT 负载字符串。
 * MQTT 传输器本身只支持字符串/Buffer 负载，因此统一走 JSON.stringify；
 * 若负载是由 `MqttRecordBuilder` 构造的 `MqttRecord`，则解包出其 data
 * 后再序列化，避免把记录包装对象本身发出去。
 */
export class MqttRecordSerializer implements Serializer<ReadPacket, string> {
  /**
   * 将消息包序列化为 JSON 字符串。
   * @param packet - Nest 内部消息包（pattern + data）
   * @returns 序列化后的 JSON 字符串，作为 MQTT 消息负载发送
   */
  serialize(packet: ReadPacket): string {
    // 1. 若负载是 MqttRecord 记录对象，解包出真实 data 再整体序列化
    if (isObject(packet?.data) && packet.data instanceof MqttRecord) {
      const record = packet.data;
      return JSON.stringify({
        ...packet,
        data: record.data,
      });
    }
    // 2. 普通负载直接 JSON 序列化
    return JSON.stringify(packet);
  }
}
