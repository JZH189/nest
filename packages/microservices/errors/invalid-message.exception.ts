import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * @publicApi
 */
export class InvalidMessageException extends RuntimeException {
  constructor() {
    super(`无效的数据或消息模式（undefined/null）`);
  }
}
