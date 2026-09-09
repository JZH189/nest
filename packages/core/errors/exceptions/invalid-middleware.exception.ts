import { INVALID_MIDDLEWARE_MESSAGE } from '../messages';
import { RuntimeException } from './runtime.exception';

/**
 * 注册的中间件类没有提供 use 方法时抛出。
 */
export class InvalidMiddlewareException extends RuntimeException {
  constructor(name: string) {
    super(INVALID_MIDDLEWARE_MESSAGE`${name}`);
  }
}
