import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import { HttpStatus } from '../enums/http-status.enum';
import {
  ArgumentMetadata,
  PipeTransform,
} from '../interfaces/features/pipe-transform.interface';
import {
  ErrorHttpStatusCode,
  HttpErrorByCode,
} from '../utils/http-error-by-code.util';
import { isNil, isString } from '../utils/shared.utils';

/**
 * @publicApi
 */
export interface ParseUUIDPipeOptions {
  /**
   * 要验证的 UUID 版本
   */
  version?: '3' | '4' | '5' | '7';
  /**
   * 验证失败时在响应中使用的 HTTP 状态码。
   */
  errorHttpStatusCode?: ErrorHttpStatusCode;
  /**
   * 验证失败时返回要抛出的异常对象的工厂函数。
   * @param error 错误信息
   * @returns 异常对象
   */
  exceptionFactory?: (errors: string) => any;
  /**
   * 如果为 true，当未提供值时，管道将返回 null 或 undefined
   * @default false
   */
  optional?: boolean;
}

/**
 * 定义内置的 ParseUUID 管道
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseUUIDPipe implements PipeTransform<string> {
  protected static uuidRegExps = {
    3: /^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
    4: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    5: /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    7: /^[0-9A-F]{8}-[0-9A-F]{4}-7[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    all: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
  };
  private readonly version: '3' | '4' | '5' | '7' | undefined;
  protected exceptionFactory: (errors: string) => any;

  constructor(@Optional() protected readonly options?: ParseUUIDPipeOptions) {
    options = options || {};
    const {
      exceptionFactory,
      errorHttpStatusCode = HttpStatus.BAD_REQUEST,
      version,
    } = options;

    this.version = version;
    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));
  }

  async transform(value: string, metadata: ArgumentMetadata): Promise<string> {
    if (isNil(value) && this.options?.optional) {
      return value;
    }
    if (!this.isUUID(value, this.version)) {
      throw this.exceptionFactory(
        `验证失败(期望 UUID${this.version ? ` v${this.version}` : ''})`,
      );
    }
    return value;
  }

  protected isUUID(str: unknown, version = 'all') {
    if (!isString(str)) {
      throw this.exceptionFactory('作为 UUID 传入的值不是字符串');
    }
    const pattern = ParseUUIDPipe.uuidRegExps[version];
    return pattern?.test(str);
  }
}
