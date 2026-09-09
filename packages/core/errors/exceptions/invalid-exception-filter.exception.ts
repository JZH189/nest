import { RuntimeException } from './runtime.exception';
import { INVALID_EXCEPTION_FILTER } from '../messages';

/**
 * 通过 @UseFilters() 注册的异常过滤器无效时抛出。
 */
export class InvalidExceptionFilterException extends RuntimeException {
  constructor() {
    super(INVALID_EXCEPTION_FILTER);
  }
}
