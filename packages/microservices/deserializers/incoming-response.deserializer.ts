import { isUndefined } from '@nestjs/common/utils/shared.utils';
import { IncomingResponse, ProducerDeserializer } from '../interfaces';

/**
 * 入站响应反序列化器。
 *
 * 用于客户端侧把从服务端收到的原始响应消息解析为统一的 `IncomingResponse`
 * 结构（id、response、isDisposed）。若消息已是 Nest 内部响应格式（含 err/
 * response/isDisposed 字段）则原样放行；否则视为外部裸数据，将其整体包装
 * 成一个已完成的响应对象。
 *
 * @publicApi
 */
export class IncomingResponseDeserializer implements ProducerDeserializer {
  /**
   * 反序列化响应消息：外部裸数据包装为标准响应，内部响应原样返回。
   * @param value - 传输层接收到的原始响应负载
   * @param options - 反序列化选项（本实现未使用）
   * @returns 标准化的 IncomingResponse 对象
   */
  deserialize(value: any, options?: Record<string, any>): IncomingResponse {
    // 1. 判断是否为外部消息（非 Nest 内部响应格式），是则包装为标准结构
    return this.isExternal(value) ? this.mapToSchema(value) : value;
  }

  /**
   * 判断响应是否来自外部（即不是 Nest 服务端返回的标准格式）。
   * @param value - 原始响应负载
   * @returns 若缺少 err/response/isDisposed 字段则视为外部消息，返回 true
   */
  isExternal(value: any): boolean {
    // 1. 空值视为外部消息
    if (!value) {
      return true;
    }
    // 2. 若已包含 err/response/isDisposed 字段，说明是 Nest 内部响应格式
    if (
      !isUndefined((value as IncomingResponse).err) ||
      !isUndefined((value as IncomingResponse).response) ||
      !isUndefined((value as IncomingResponse).isDisposed)
    ) {
      return false;
    }
    return true;
  }

  /**
   * 将外部裸数据包装为标准响应结构。
   * @param value - 原始响应负载
   * @returns 以 value 作为响应体、标记为已完成的 IncomingResponse 对象
   */
  mapToSchema(value: any): IncomingResponse {
    return {
      id: value && value.id, // 1. 尽力提取关联 id（可能为 undefined）
      response: value, // 2. 整个原始负载作为响应体
      isDisposed: true, // 3. 标记为已终结（无后续分片/错误流）
    };
  }
}
