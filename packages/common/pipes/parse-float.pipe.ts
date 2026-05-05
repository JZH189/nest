import { Injectable, Optional } from '../decorators/core';
import { ArgumentMetadata, HttpStatus } from '../index';
import { PipeTransform } from '../interfaces/features/pipe-transform.interface';
import {
  ErrorHttpStatusCode,
  HttpErrorByCode,
} from '../utils/http-error-by-code.util';
import { isNil } from '../utils/shared.utils';

/**
 * @publicApi
 */
export interface ParseFloatPipeOptions {
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
  /**
   * 如果为 true，当未提供值时，管道将返回 null 或 undefined
   * @default false
   */
  optional?: boolean;
}

/**
 * 定义内置的 ParseFloat 管道
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseFloatPipe implements PipeTransform<string> {
  protected exceptionFactory: (error: string) => any;

  constructor(@Optional() protected readonly options?: ParseFloatPipeOptions) {
    options = options || {};
    const { exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST } =
      options;

    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));
  }

  /**
   * 访问并对正在处理的请求参数执行可选转换的方法。
   *
   * @param value 当前处理的路由参数
   * @param metadata 包含当前处理的路由参数的元数据
   */
  async transform(value: string, metadata: ArgumentMetadata): Promise<number> {
    if (isNil(value) && this.options?.optional) {
      return value;
    }
    if (!this.isNumeric(value)) {
      throw this.exceptionFactory(
        '验证失败(期望数字字符串)',
      );
    }
    return parseFloat(value);
  }

  /**
   * @param value 当前处理的路由参数
   * @returns 如果 value 是有效的浮点数则返回 true
   */
  protected isNumeric(value: string): boolean {
    return (
      ['string', 'number'].includes(typeof value) &&
      !isNaN(parseFloat(value)) &&
      isFinite(value as any)
    );
  }
}
