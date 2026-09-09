import { UNDEFINED_FORWARDREF_MESSAGE } from '../messages';
import { RuntimeException } from './runtime.exception';
import { Type } from '@nestjs/common';

/**
 * 模块间存在循环依赖导致模块实例无法创建时抛出（提示使用 forwardRef()）。
 */
export class UndefinedForwardRefException extends RuntimeException {
  constructor(scope: Type<any>[]) {
    super(UNDEFINED_FORWARDREF_MESSAGE(scope));
  }
}
