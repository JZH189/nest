import { RuntimeException } from './runtime.exception';
import { INVALID_MIDDLEWARE_CONFIGURATION } from '../messages';

/**
 * 在模块 configure() 方法中传入无效的中间件配置时抛出。
 */
export class InvalidMiddlewareConfigurationException extends RuntimeException {
  constructor() {
    super(INVALID_MIDDLEWARE_CONFIGURATION);
  }
}
