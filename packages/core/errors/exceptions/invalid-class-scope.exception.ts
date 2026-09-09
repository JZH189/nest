import { Abstract, Type } from '@nestjs/common/interfaces';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { INVALID_CLASS_SCOPE_MESSAGE } from '../messages';
import { RuntimeException } from './runtime.exception';

/**
 * 对请求/瞬态作用域（scoped）的提供者调用 get() 方法时抛出（应改用 resolve()）。
 */
export class InvalidClassScopeException extends RuntimeException {
  constructor(metatypeOrToken: Type<any> | Abstract<any> | string | symbol) {
    let name = isFunction(metatypeOrToken)
      ? (metatypeOrToken as Function).name
      : metatypeOrToken;
    name = name && name.toString();

    super(INVALID_CLASS_SCOPE_MESSAGE`${name}`);
  }
}
