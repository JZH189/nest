import { isObject, isString } from '@nestjs/common/utils/shared.utils';

/**
 * RPC 通信中抛出的统一异常类型：微服务消息处理程序抛出的所有异常
 * 都会被序列化为该异常并通过网络回传给客户端。
 *
 * @publicApi
 */
export class RpcException extends Error {
  constructor(private readonly error: string | object) {
    super();
    this.initMessage();
  }

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

  public getError(): string | object {
    return this.error;
  }
}
