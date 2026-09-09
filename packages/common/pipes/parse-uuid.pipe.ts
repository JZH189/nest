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
 * 解析并校验 UUID 参数的选项
 *
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
 * 属于校验型管道（值本身不转换）：用正则校验路由参数是否为合法的 UUID 字符串，
 * 可通过 `version` 限定 UUID v3/v4/v5/v7，非法值默认抛出 400 Bad Request 异常。
 * 该管道在路由处理方法被调用之前由框架自动执行。
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseUUIDPipe implements PipeTransform<string> {
  /**
   * 各 UUID 版本对应的校验正则表达式集合（`all` 为不区分版本的通用正则）
   */
  protected static uuidRegExps = {
    3: /^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
    4: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    5: /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    7: /^[0-9A-F]{8}-[0-9A-F]{4}-7[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    all: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
  };
  /**
   * 要校验的 UUID 版本（未指定时使用通用正则 `all`）
   */
  private readonly version: '3' | '4' | '5' | '7' | undefined;
  /**
   * 校验失败时用于构造待抛出异常的工厂函数
   */
  protected exceptionFactory: (errors: string) => any;

  /**
   * 构造函数：记录目标 UUID 版本并初始化异常工厂
   *
   * @param options 解析 UUID 管道的配置项
   */
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

  /**
   * 访问并对正在处理的请求参数执行可选校验的方法。
   *
   * @param value 当前处理的路由参数
   * @param metadata 包含当前处理的路由参数的元数据
   * @returns 校验通过后的原值（本管道只做校验，不做转换）
   */
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

  /**
   * 用对应版本的正则校验字符串是否为合法 UUID
   *
   * @param str 待校验的值
   * @param version 要校验的 UUID 版本，默认 `'all'`（不限版本）
   * @returns 校验通过则返回 `true`
   * @throws 当传入值不是字符串时抛出异常
   */
  protected isUUID(str: unknown, version = 'all') {
    if (!isString(str)) {
      throw this.exceptionFactory('作为 UUID 传入的值不是字符串');
    }
    const pattern = ParseUUIDPipe.uuidRegExps[version];
    return pattern?.test(str);
  }
}
