import { isUndefined } from '@nestjs/common/utils/shared.utils';
import {
  ConsumerDeserializer,
  IncomingEvent,
  IncomingRequest,
} from '../interfaces';

/**
 * 入站请求/事件反序列化器。
 *
 * 用于服务端（如 Redis、MQTT、NATS 等基于 JSON 文本的传输器）把接收到的
 * 原始消息解析为统一的 `IncomingRequest`（请求）或 `IncomingEvent`（事件）结构。
 * 若消息已经是 Nest 内部格式（含 pattern/data 字段）则原样放行，
 * 否则将其视为"外部消息"，根据传输通道（channel）信息映射成标准模式。
 *
 * @publicApi
 */
export class IncomingRequestDeserializer implements ConsumerDeserializer {
  /**
   * 反序列化入站消息：外部消息映射为标准 schema，内部消息原样返回。
   * @param value - 传输层接收到的原始消息负载
   * @param options - 反序列化选项，通常包含 channel（消息所属的通道/主题，即路由 pattern）
   * @returns 标准化的 IncomingRequest 或 IncomingEvent 对象
   */
  deserialize(
    value: any,
    options?: Record<string, any>,
  ): IncomingRequest | IncomingEvent {
    // 1. 判断是否为外部消息（非 Nest 内部格式），是则映射为标准 schema，否则原样返回
    return this.isExternal(value) ? this.mapToSchema(value, options) : value;
  }

  /**
   * 判断消息是否来自外部（即不是 Nest 客户端发出的标准格式）。
   * @param value - 原始消息负载
   * @returns 若缺少 pattern/data 字段则视为外部消息，返回 true
   */
  isExternal(value: any): boolean {
    // 1. 空值视为外部消息
    if (!value) {
      return true;
    }
    // 2. 若已包含 pattern 或 data 字段，说明是 Nest 内部格式，不是外部消息
    if (
      !isUndefined((value as IncomingRequest).pattern) ||
      !isUndefined((value as IncomingRequest).data)
    ) {
      return false;
    }
    return true;
  }

  /**
   * 将外部消息映射为标准的请求/事件结构。
   * @param value - 原始消息负载
   * @param options - 反序列化选项，取其 channel 作为路由 pattern
   * @returns 包含 pattern 与 data 的标准结构；无 options 时各字段为 undefined
   */
  mapToSchema(
    value: any,
    options?: Record<string, any>,
  ): IncomingRequest | IncomingEvent {
    // 1. 无选项时返回空的 pattern/data 占位结构
    if (!options) {
      return {
        pattern: undefined,
        data: undefined,
      };
    }
    // 2. 将传输通道（channel/主题名）作为消息路由 pattern，原始负载作为 data
    return {
      pattern: options.channel,
      data: value,
    };
  }
}
