import { isNil } from '@nestjs/common/utils/shared.utils';
import { KafkaParserConfig } from '../interfaces';

/**
 * Kafka 消息解析器。
 *
 * Kafka 消费到的记录中 value/key/headers 都是 Buffer（二进制），
 * 本类负责把它们尽量解码为可用的 JS 对象/字符串：
 * - 默认对 value 做 JSON 尝试解析；配置 keepBinary 时保留原始二进制（流式负载场景）；
 * - 解析时会克隆记录对象，避免污染 KafkaJS 内部状态（否则会破坏其重试机制）。
 */
export class KafkaParser {
  protected readonly keepBinary: boolean;

  /**
   * @param config - 解析器配置，keepBinary 为 true 时保留二进制负载不解码
   */
  constructor(config?: KafkaParserConfig) {
    this.keepBinary = (config && config.keepBinary) || false;
  }

  /**
   * 解析一条 Kafka 消费记录，把 Buffer 形式的 value/key/headers 解码。
   * @param data - KafkaJS 消费记录（value/key/headers 均为 Buffer）
   * @returns 解码后的记录对象
   */
  public parse<T = any>(data: any): T {
    // Clone object to as modifying the original one would break KafkaJS retries
    // 1. 浅克隆记录与 headers，避免修改原对象破坏 KafkaJS 的重试机制
    const result = {
      ...data,
      headers: { ...data.headers },
    };

    // 2. 非二进制模式时解码消息体 value
    if (!this.keepBinary) {
      result.value = this.decode(data.value);
    }

    // 3. 解码消息 key
    if (!isNil(data.key)) {
      result.key = this.decode(data.key);
    }
    // 4. 逐个解码 headers；没有 headers 时归一化为空对象
    if (!isNil(data.headers)) {
      const decodeHeaderByKey = (key: string) => {
        result.headers[key] = this.decode(data.headers[key]);
      };
      Object.keys(data.headers).forEach(decodeHeaderByKey);
    } else {
      result.headers = {};
    }
    return result;
  }

  /**
   * 将 Buffer 解码为对象、字符串或保留原二进制。
   * @param value - 待解码的 Buffer
   * @returns JSON 对象（可解析时）/ 字符串 / null（空值）/ 原始 Buffer（schema 二进制负载）
   */
  public decode(value: Buffer): object | string | null | Buffer {
    if (isNil(value)) {
      return null;
    }
    // A value with the "leading zero byte" indicates the schema payload.
    // The "content" is possibly binary and should not be touched & parsed.
    // 1. 首字节为 0 表示这是 schema（如 Avro/Protobuf）编码的二进制负载，保持原样不解析
    if (
      Buffer.isBuffer(value) &&
      value.length > 0 &&
      value.readUInt8(0) === 0
    ) {
      return value;
    }

    // 2. 先转为字符串
    let result = value.toString();
    const startChar = result.charAt(0);

    // Only try to parse objects and arrays
    // 3. 只有以 '{' 或 '[' 开头的内容才尝试 JSON.parse，失败则保持字符串形式
    if (startChar === '{' || startChar === '[') {
      try {
        result = JSON.parse(value.toString());
      } catch (e) {
        // Do nothing
      }
    }
    return result;
  }
}
