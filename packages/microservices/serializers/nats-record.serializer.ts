import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { NatsCodec } from '../external/nats-codec.interface';
import { ReadPacket } from '../interfaces';
import { Serializer } from '../interfaces/serializer.interface';
import { NatsRecord, NatsRecordBuilder } from '../record-builders';

let natsPackage = {} as any;

/**
 * NATS 记录序列化器。
 *
 * 在发送消息前把 Nest 内部消息包（ReadPacket）编码为 `NatsRecord`
 * （二进制 data + 可选 NATS headers）。负载用 NATS 官方客户端的
 * `JSONCodec` 编码；若负载是由 `NatsRecordBuilder` 构造的 `NatsRecord`
 * （可能已带 headers），则复用其 headers。
 */
export class NatsRecordSerializer implements Serializer<
  ReadPacket,
  NatsRecord
> {
  private readonly jsonCodec: NatsCodec<unknown>;

  constructor() {
    // 1. 按需加载 nats 包（未安装时抛出友好错误），并创建 JSON 编解码器
    natsPackage = loadPackage('nats', NatsRecordSerializer.name, () =>
      require('nats'),
    );
    this.jsonCodec = natsPackage.JSONCodec();
  }

  /**
   * 将消息包编码为 NATS 记录。
   * @param packet - Nest 内部消息包（pattern + data，data 可能是 NatsRecord）
   * @returns 含编码后二进制 data 与可选 headers 的 NatsRecord
   */
  serialize(packet: any): NatsRecord {
    // 1. 若负载已是 NatsRecord 则直接复用（保留其 headers），
    //    否则用 NatsRecordBuilder 把 packet.headers 附加到负载上构造新记录
    const natsMessage =
      packet?.data && isObject(packet.data) && packet.data instanceof NatsRecord
        ? packet.data
        : new NatsRecordBuilder(packet?.data)
            .setHeaders(packet?.headers)
            .build();

    return {
      // 2. 用 NATS JSON 编解码器把完整消息包（data 替换为记录的实际负载）编码为二进制
      data: this.jsonCodec.encode({ ...packet, data: natsMessage.data }),
      headers: natsMessage.headers,
    };
  }
}
