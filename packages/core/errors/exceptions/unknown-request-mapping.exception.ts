import type { Type } from '@nestjs/common';
import { RuntimeException } from './runtime.exception';
import { UNKNOWN_REQUEST_MAPPING } from '../messages';

/**
 * 模块 controllers 数组中的类缺少 @Controller() 装饰器时抛出。
 */
export class UnknownRequestMappingException extends RuntimeException {
  constructor(metatype: Type) {
    super(UNKNOWN_REQUEST_MAPPING(metatype));
  }
}
