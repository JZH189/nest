import { isObject, isString } from '@nestjs/common/utils/shared.utils';

/**
 * WebSocket 异常（WsException）：在网关处理方法中抛出，
 * 最终会被异常过滤器捕获并作为 'exception' 事件回传给客户端。
 */
export class WsException extends Error {
  /**
   * @param error - 错误信息，可以是字符串或包含 message 字段的对象。
   */
  constructor(private readonly error: string | object) {
    super();
    this.initMessage();
  }

  /**
   * 初始化 Error.message：
   * 1. error 为字符串时直接使用；
   * 2. error 为带 message 字段的对象时取其 message；
   * 3. 否则用类名（驼峰拆分为空格分隔的单词，如 "WsException" -> "Ws Exception"）。
   *
   * @returns 无返回值。
   */
  public initMessage() {
    if (isString(this.error)) {
      this.message = this.error;
    } else if (
      isObject(this.error) &&
      isString((this.error as Record<string, any>).message)
    ) {
      this.message = (this.error as Record<string, any>).message;
    } else if (this.constructor) {
      this.message = this.constructor.name
        .match(/[A-Z][a-z]+|[0-9]+/g)!
        .join(' ');
    }
  }

  /**
   * 获取原始错误信息（字符串或对象），异常过滤器会用它构造回传给客户端的负载。
   *
   * @returns 原始错误内容。
   */
  public getError(): string | object {
    return this.error;
  }
}
