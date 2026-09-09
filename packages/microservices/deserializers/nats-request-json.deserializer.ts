import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { NatsCodec } from '../external/nats-codec.interface';
import { IncomingEvent, IncomingRequest } from '../interfaces';
import { IncomingRequestDeserializer } from './incoming-request.deserializer';

let natsPackage = {} as any;

/**
 * NATS 请求 JSON 反序列化器。
 *
 * 继承自 `IncomingRequestDeserializer`，在其基础上先用 NATS 官方客户端的
 * `JSONCodec` 将二进制负载（Uint8Array）解码为 JavaScript 对象，
 * 再交给父类完成 Nest 标准请求/事件结构的映射。
 *
 * @publicApi
 */
export class NatsRequestJSONDeserializer extends IncomingRequestDeserializer {
  private readonly jsonCodec: NatsCodec<unknown>;

  constructor() {
    super();

    // 1. 按需加载 nats 包（未安装时抛出友好错误），并创建 JSON 编解码器
    natsPackage = loadPackage('nats', NatsRequestJSONDeserializer.name, () =>
      require('nats'),
    );
    this.jsonCodec = natsPackage.JSONCodec();
  }

  /**
   * 反序列化 NATS 入站消息。
   * @param value - NATS 消息的二进制负载
   * @param options - 反序列化选项，通常包含 channel（订阅的主题名，即路由 pattern）
   * @returns 标准化的 IncomingRequest 或 IncomingEvent 对象
   */
  deserialize(
    value: Uint8Array,
    options?: Record<string, any>,
  ): IncomingRequest | IncomingEvent {
    // 1. 先用 NATS JSON 编解码器把二进制解码为 JS 对象
    const decodedRequest = this.jsonCodec.decode(value);
    // 2. 再复用父类逻辑映射为标准请求/事件结构
    return super.deserialize(decodedRequest, options);
  }
}
