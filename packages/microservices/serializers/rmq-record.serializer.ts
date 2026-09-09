import { isObject } from '@nestjs/common/utils/shared.utils';
import { ReadPacket } from '../interfaces';
import { Serializer } from '../interfaces/serializer.interface';
import { RmqRecord } from '../record-builders';

/**
 * RabbitMQ（RMQ）记录序列化器。
 *
 * 在发送消息前对 Nest 内部消息包做解包适配：若负载是由 `RmqRecordBuilder`
 * 构造的 `RmqRecord`（附带发布选项 options），则把其 data 与 options 展开
 * 到消息包上，供 RMQ 客户端在 publish 时使用（如持久化、优先级等发布参数）；
 * 普通负载原样返回（JSON 序列化由底层 Socket/TCP 层完成）。
 */
export class RmqRecordSerializer implements Serializer<
  ReadPacket,
  ReadPacket & Partial<RmqRecord>
> {
  /**
   * 将消息包转换为可交给 RMQ 发布的数据结构。
   * @param packet - Nest 内部消息包（pattern + data，data 可能是 RmqRecord）
   * @returns 展开了 RmqRecord 的 data 与 options 后的消息包；普通负载原样返回
   */
  serialize(packet: ReadPacket): ReadPacket & Partial<RmqRecord> {
    // 1. 若负载是 RmqRecord 记录对象，则展开其 data 与发布选项 options
    if (
      packet?.data &&
      isObject(packet.data) &&
      packet.data instanceof RmqRecord
    ) {
      const record = packet.data;
      return {
        ...packet,
        data: record.data,
        options: record.options,
      };
    }
    // 2. 普通负载不做处理，原样返回
    return packet;
  }
}
