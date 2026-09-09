import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 当 TCP 服务器接收到的数据不合法（如包长度值损坏、消息格式无法解析）时抛出。
 */
export class InvalidTcpDataReceptionException extends RuntimeException {
  constructor(err: string | Error) {
    const errMsgStr =
      typeof err === 'string'
        ? err
        : err &&
            typeof err === 'object' &&
            'message' in err &&
            typeof (err as any).message === 'string'
          ? (err as any).message
          : String(err);
    const _errMsg = errMsgStr.includes('Corrupted length value')
      ? `包中提供的接收数据的长度值已损坏`
      : `TCP 服务器接收到的消息无效`;
    super(_errMsg);
  }
}
