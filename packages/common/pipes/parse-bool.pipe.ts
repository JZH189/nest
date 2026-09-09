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
import { isNil } from '../utils/shared.utils';

/**
 * @publicApi
 */
export interface ParseBoolPipeOptions {
  /**
   * 验证失败时在响应中使用的 HTTP 状态码。
   */
  errorHttpStatusCode?: ErrorHttpStatusCode;
  /**
   * 如果验证失败，返回要抛出的异常对象的工厂函数。
   * @param error 错误消息
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
 * 定义内置的 ParseBool 管道
 *
 * 属于解析型（Parse）管道：把路由参数（通常来自查询字符串）转换为布尔值。
 * 仅接受 `true`/`'true'`/`false`/`'false'`，其他值默认抛出 400 Bad Request 异常。
 * 该管道在路由处理方法被调用之前由框架自动执行。
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseBoolPipe implements PipeTransform<
  string | boolean,
  Promise<boolean>
> {
  /**
   * 校验失败时用于构造待抛出异常的工厂函数
   */
  protected exceptionFactory: (error: string) => any;

  /**
   * 构造函数：初始化异常工厂（默认按 `errorHttpStatusCode` 生成对应 HTTP 异常）
   *
   * @param options 解析布尔管道的配置项
   */
  constructor(@Optional() protected readonly options?: ParseBoolPipeOptions) {
    options = options || {};
    const { exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST } =
      options;
    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));
  }

  /**
   * 访问并对正在处理中的请求参数执行可选转换的方法。
   *
   * @param value 当前正在处理的路由参数
   * @param metadata 包含有关当前正在处理的路由参数的元数据
   */
  async transform(
    value: string | boolean,
    metadata: ArgumentMetadata,
  ): Promise<boolean> {
    if (isNil(value) && this.options?.optional) {
      return value;
    }
    if (this.isTrue(value)) {
      return true;
    }
    if (this.isFalse(value)) {
      return false;
    }
    throw this.exceptionFactory(
      'Validation failed (boolean string is expected)',
    );
  }

  /**
   * @param value 当前正在处理的路由参数
   * @returns 如果 `value` 为 'true'，即等于布尔值 `true` 或字符串 `"true"`，则返回 `true`
   */
  protected isTrue(value: string | boolean): boolean {
    return value === true || value === 'true';
  }

  /**
   * @param value 当前正在处理的路由参数
   * @returns 如果 `value` 为 'false'，即等于布尔值 `false` 或字符串 `"false"`，则返回 `true`
   */
  protected isFalse(value: string | boolean): boolean {
    return value === false || value === 'false';
  }
}
