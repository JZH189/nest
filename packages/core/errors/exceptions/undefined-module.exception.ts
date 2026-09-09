import { RuntimeException } from './runtime.exception';
import { UNDEFINED_MODULE_MESSAGE } from '../messages';

/**
 * 模块 imports 数组中某个模块在运行时为 undefined（循环依赖或导入错误）时抛出。
 */
export class UndefinedModuleException extends RuntimeException {
  constructor(parentModule: any, index: number, scope: any[]) {
    super(UNDEFINED_MODULE_MESSAGE(parentModule, index, scope));
  }
}
