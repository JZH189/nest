import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { NatsCodec } from '../external/nats-codec.interface';
import { IncomingResponse } from '../interfaces';
import { IncomingResponseDeserializer } from './incoming-response.deserializer';
import { NatsRequestJSONDeserializer } from './nats-request-json.deserializer';

let natsPackage = {} as any;

/**
 * NATS 响应 JSON 反序列化器。
 *
 * 继承自 `IncomingResponseDeserializer`，在其基础上先用 NATS 官方客户端的
 * `JSONCodec` 将二进制响应负载（Uint8Array）解码为 JavaScript 对象，
 * 再交给父类完成 `IncomingResponse` 标准响应结构的映射。
 *
 * @publicApi
 */
export class NatsResponseJSONDeserializer extends IncomingResponseDeserializer {
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
   * 反序列化 NATS 响应消息。
   * @param value - NATS 响应的二进制负载
   * @param options - 反序列化选项（透传给父类，本实现未使用）
   * @returns 标准化的 IncomingResponse 对象
   */
  deserialize(
    value: Uint8Array,
    options?: Record<string, any>,
  ): IncomingResponse {
    // 1. 先用 NATS JSON 编解码器把二进制解码为 JS 对象
    const decodedRequest = this.jsonCodec.decode(value);
    // 2. 再复用父类逻辑包装为标准响应结构
    return super.deserialize(decodedRequest, options);
  }
}
