import { INVALID_MODULE_MESSAGE } from '../messages';
import { RuntimeException } from './runtime.exception';

/**
 * 模块 imports 数组中出现了无效值（非模块类型）时抛出。
 */
export class InvalidModuleException extends RuntimeException {
  constructor(parentModule: any, index: number, scope: any[]) {
    super(INVALID_MODULE_MESSAGE(parentModule, index, scope));
  }
}
