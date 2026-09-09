import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 当接收到的消息内容或其模式（pattern）为 undefined/null 等无效值时抛出。
 *
 * @publicApi
 */
export class InvalidMessageException extends RuntimeException {
  constructor() {
    super(`无效的数据或消息模式（undefined/null）`);
  }
}
