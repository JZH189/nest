import { Injectable, Optional } from '../decorators/core';
import { ArgumentMetadata, HttpStatus } from '../index';
import { PipeTransform } from '../interfaces/features/pipe-transform.interface';
import {
  ErrorHttpStatusCode,
  HttpErrorByCode,
} from '../utils/http-error-by-code.util';
import { isNil } from '../utils/shared.utils';

/**
 * 解析浮点数参数的选项
 *
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
 * 属于解析型（Parse）管道：把数字字符串路由参数转换为浮点数（`number`）。
 * 值不是有效数字字符串时默认抛出 400 Bad Request 异常。
 * 该管道在路由处理方法被调用之前由框架自动执行。
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseFloatPipe implements PipeTransform<string> {
  /**
   * 校验失败时用于构造待抛出异常的工厂函数
   */
  protected exceptionFactory: (error: string) => any;

  /**
   * 构造函数：初始化异常工厂（默认按 `errorHttpStatusCode` 生成对应 HTTP 异常）
   *
   * @param options 解析浮点数管道的配置项
   */
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
   * @returns 转换后的浮点数
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
