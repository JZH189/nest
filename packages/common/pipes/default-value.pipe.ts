import { Injectable } from '../decorators/core/injectable.decorator';
import {
  ArgumentMetadata,
  PipeTransform,
} from '../interfaces/features/pipe-transform.interface';
import { isNil, isNumber } from '../utils/shared.utils';

/**
 * 定义内置的 DefaultValue 管道
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class DefaultValuePipe<T = any, R = any> implements PipeTransform<
  T,
  T | R
> {
  constructor(protected readonly defaultValue: R) {}

  transform(value?: T, _metadata?: ArgumentMetadata): T | R {
    if (
      isNil(value) ||
      (isNumber(value) && isNaN(value as unknown as number))
    ) {
      return this.defaultValue;
    }
    return value;
  }
}
