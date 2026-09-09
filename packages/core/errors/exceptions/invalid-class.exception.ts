import { INVALID_CLASS_MESSAGE } from '../messages';
import { RuntimeException } from './runtime.exception';

/**
 * ModuleRef 无法实例化传入的类（该值不可构造）时抛出。
 */
export class InvalidClassException extends RuntimeException {
  constructor(value: any) {
    super(INVALID_CLASS_MESSAGE`${value}`);
  }
}
