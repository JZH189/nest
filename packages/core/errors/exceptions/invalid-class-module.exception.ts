import { USING_INVALID_CLASS_AS_A_MODULE_MESSAGE } from '../messages';
import { RuntimeException } from './runtime.exception';

/**
 * 在模块的 imports 数组中错误地放入了 @Injectable()、@Controller() 或 @Catch() 装饰的类时抛出。
 */
export class InvalidClassModuleException extends RuntimeException {
  constructor(metatypeUsedAsAModule: any, scope: any[]) {
    super(
      USING_INVALID_CLASS_AS_A_MODULE_MESSAGE(metatypeUsedAsAModule, scope),
    );
  }
}
