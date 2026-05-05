import { Injectable } from '../decorators/core/injectable.decorator';
import { HttpStatus } from '../enums/http-status.enum';
import { PipeTransform } from '../interfaces/features/pipe-transform.interface';
import {
  ErrorHttpStatusCode,
  HttpErrorByCode,
} from '../utils/http-error-by-code.util';
import { isNil } from '../utils/shared.utils';

export interface ParseDatePipeOptions {
  /**
   * 如果为 true，当未提供值时，管道将返回 null 或 undefined
   * @default false
   */
  optional?: boolean;
  /**
   * 日期的默认值
   */
  default?: () => Date;
  /**
   * 验证失败时在响应中使用的 HTTP 状态码。
   */
  errorHttpStatusCode?: ErrorHttpStatusCode;
  /**
   * 验证失败时返回要抛出的异常对象的工厂函数。
   * @param error 错误信息
   * @returns 异常对象
   */
  exceptionFactory?: (error: string) => any;
}

@Injectable()
export class ParseDatePipe implements PipeTransform<
  string | number | undefined | null
> {
  protected exceptionFactory: (error: string) => any;

  constructor(private readonly options: ParseDatePipeOptions = {}) {
    const { exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST } =
      options;

    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));
  }

  /**
   * 访问并对正在处理的请求参数执行可选转换的方法。
   *
   * @param value 当前正在处理的路由参数
   * @param metadata 包含有关当前正在处理的路由参数的元数据
   */
  transform(
    value: string | number | undefined | null,
  ): Date | null | undefined {
    if (this.options.optional && isNil(value)) {
      return this.options.default ? this.options.default() : value;
    }

    if (isNil(value) || value === '') {
      throw this.exceptionFactory('验证失败(未提供日期)');
    }

    const transformedValue = new Date(value);

    if (isNaN(transformedValue.getTime())) {
      throw this.exceptionFactory('验证失败(无效的日期格式)');
    }

    return transformedValue;
  }
}
