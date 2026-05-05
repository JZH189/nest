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
export interface ParseEnumPipeOptions {
  /**
   * 如果为 true，当未提供值时，管道将返回 null 或 undefined
   * @default false
   */
  optional?: boolean;
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

/**
 * 定义内置的 ParseEnum 管道
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseEnumPipe<T = any> implements PipeTransform<T> {
  protected exceptionFactory: (error: string) => any;
  constructor(
    protected readonly enumType: T,
    @Optional() protected readonly options?: ParseEnumPipeOptions,
  ) {
    if (!enumType) {
      throw new Error(
        `"ParseEnumPipe" 需要指定 "enumType" 参数(用于验证输入值)`,
      );
    }
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
  async transform(value: T, metadata: ArgumentMetadata): Promise<T> {
    if (isNil(value) && this.options?.optional) {
      return value;
    }
    if (!this.isEnum(value)) {
      throw this.exceptionFactory(
        '验证失败(期望枚举字符串)',
      );
    }
    return value;
  }

  protected isEnum(value: T): boolean {
    const enumValues = Object.keys(this.enumType as object).map(
      item => this.enumType[item],
    );
    return enumValues.includes(value);
  }
}
