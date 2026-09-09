import { Injectable } from '../decorators/core/injectable.decorator';
import { HttpStatus } from '../enums/http-status.enum';
import { PipeTransform } from '../interfaces/features/pipe-transform.interface';
import {
  ErrorHttpStatusCode,
  HttpErrorByCode,
} from '../utils/http-error-by-code.util';
import { isNil } from '../utils/shared.utils';

/**
 * 解析日期参数的选项
 */
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

/**
 * 定义内置的 ParseDate 管道
 *
 * 属于解析型（Parse）管道：把路由参数（字符串或时间戳数字）转换为 `Date` 对象。
 * 当值为空或无法解析为有效日期时，默认抛出 400 Bad Request 异常；
 * 可通过 `optional`/`default` 配置空值的处理方式。
 * 该管道在路由处理方法被调用之前由框架自动执行。
 */
@Injectable()
export class ParseDatePipe implements PipeTransform<
  string | number | undefined | null
> {
  /**
   * 校验失败时用于构造待抛出异常的工厂函数
   */
  protected exceptionFactory: (error: string) => any;

  /**
   * 构造函数：初始化异常工厂（默认按 `errorHttpStatusCode` 生成对应 HTTP 异常）
   *
   * @param options 解析日期管道的配置项
   */
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
   * 处理流程：
   * 1. 若开启 `optional` 且值为空，返回 `default`（若配置）或原空值；
   * 2. 若值为空字符串或 `undefined`/`null`，抛出"未提供日期"异常；
   * 3. 用 `new Date(value)` 转换，若得到无效日期（NaN）则抛出"无效的日期格式"异常。
   *
   * @param value 当前正在处理的路由参数
   * @param metadata 包含有关当前正在处理的路由参数的元数据
   * @returns 转换后的 `Date` 对象；开启 `optional` 时也可能返回 `null`/`undefined`
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
