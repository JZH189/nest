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
  /**
   * 构造函数，传入当原始值为 `undefined`/`null`（或 `NaN`）时要使用的默认值
   *
   * @param defaultValue 参数缺失时返回的默认值
   */
  constructor(protected readonly defaultValue: R) {}

  /**
   * 管道核心方法：对参数做"兜底"转换，属于转换型（Parse）管道。
   * 该方法在路由处理方法被调用之前由框架自动执行。
   *
   * @param value 当前正在处理的路由参数
   * @param _metadata 包含有关当前正在处理的路由参数的元数据（本管道未使用）
   * @returns 如果值为 `undefined`/`null`/`NaN` 则返回默认值，否则原样返回
   */
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
