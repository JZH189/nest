import {
  HttpExceptionBody,
  HttpExceptionBodyMessage,
} from '../interfaces/http/http-exception-body.interface';
import { isNumber, isObject, isString } from '../utils/shared.utils';
import { IntrinsicException } from './intrinsic.exception';

export interface HttpExceptionOptions {
  /** 错误的原始原因 */
  cause?: unknown;
  description?: string;
}

export interface DescriptionAndOptions {
  description?: string;
  httpExceptionOptions?: HttpExceptionOptions;
}

/**
 * 定义 Nest 的基础 HTTP 异常类，由默认的异常处理器处理。
 *
 * @see [内置 HTTP 异常](https://docs.nestjs.cn/exception-filters#built-in-http-exceptions)
 *
 * @publicApi
 */
export class HttpException extends IntrinsicException {
  /**
   * 异常原因。表示错误的特定原始原因。
   * 当捕获并重新抛出错误以获得更具体或更有用的错误消息时使用，以保留对原始错误的访问。
   */
  public cause: unknown;

  /**
   * 创建一个简单的 HTTP 异常实例。
   *
   * @example
   * throw new HttpException('消息', HttpStatus.BAD_REQUEST)
   * throw new HttpException('自定义消息', HttpStatus.BAD_REQUEST, {
   *  cause: new Error('原始错误'),
   * })
   *
   *
   * @usageNotes
   * 构造函数参数定义了响应和 HTTP 响应状态码。
   * - `response` 参数(必需)定义了 JSON 响应体。它也可以是一个错误对象，
   *  用于定义错误的[原因](https://nodejs.org/en/blog/release/v16.9.0/#error-cause)。
   * - `status` 参数(必需)定义了 HTTP 状态码。
   * - `options` 参数(可选)定义了额外的错误选项。目前支持 `cause` 属性，
   *  可以作为指定错误原因的替代方式: `const error = new HttpException('描述', 400, { cause: new Error() });`
   *
   * 默认情况下，JSON 响应体包含两个属性:
   * - `statusCode`: HTTP 状态码。
   * - `message`: HTTP 错误的简短描述。可以通过在 `response` 参数中提供字符串来覆盖此值。
   *
   * 要覆盖整个 JSON 响应体，请将对象传递给 `createBody` 方法。
   * Nest 会序列化该对象并将其作为 JSON 响应体返回。
   *
   * `status` 参数是必需的，应该是有效的 HTTP 状态码。
   * 最佳实践是使用从 `nestjs/common` 导入的 `HttpStatus` 枚举。
   *
   * @param response 描述错误条件或错误原因的字符串或对象。
   * @param status HTTP 响应状态码。
   * @param options 用于添加错误原因的对象。
   */
  constructor(
    private readonly response: string | Record<string, any>,
    private readonly status: number,
    private readonly options?: HttpExceptionOptions,
  ) {
    super();
    this.initMessage();
    this.initName();
    this.initCause();
  }

  /**
   * 配置错误链支持
   *
   * @see https://nodejs.org/en/blog/release/v16.9.0/#error-cause
   * @see https://github.com/microsoft/TypeScript/issues/45167
   */
  public initCause(): void {
    if (this.options?.cause) {
      this.cause = this.options.cause;
      return;
    }
  }

  public initMessage() {
    if (isString(this.response)) {
      this.message = this.response;
    } else if (isObject(this.response) && isString(this.response.message)) {
      this.message = this.response.message;
    } else if (this.constructor) {
      this.message =
        this.constructor.name.match(/[A-Z][a-z]+|[0-9]+/g)?.join(' ') ??
        'Error';
    }
  }

  public initName(): void {
    this.name = this.constructor.name;
  }

  public getResponse(): string | object {
    return this.response;
  }

  public getStatus(): number {
    return this.status;
  }

  public static createBody(
    nil: null | '',
    message: HttpExceptionBodyMessage,
    statusCode: number,
  ): HttpExceptionBody;
  public static createBody(
    message: HttpExceptionBodyMessage,
    error: string,
    statusCode: number,
  ): HttpExceptionBody;
  public static createBody<Body extends Record<string, unknown>>(
    custom: Body,
  ): Body;
  public static createBody<Body extends Record<string, unknown>>(
    arg0: null | HttpExceptionBodyMessage | Body,
    arg1?: HttpExceptionBodyMessage | string,
    statusCode?: number,
  ): HttpExceptionBody | Body {
    if (!arg0) {
      return {
        message: arg1!,
        statusCode: statusCode!,
      };
    }

    if (isString(arg0) || Array.isArray(arg0) || isNumber(arg0)) {
      return {
        message: arg0,
        error: arg1 as string,
        statusCode: statusCode!,
      };
    }

    return arg0;
  }

  public static getDescriptionFrom(
    descriptionOrOptions: string | HttpExceptionOptions,
  ): string {
    return isString(descriptionOrOptions)
      ? descriptionOrOptions
      : (descriptionOrOptions?.description as string);
  }

  public static getHttpExceptionOptionsFrom(
    descriptionOrOptions: string | HttpExceptionOptions,
  ): HttpExceptionOptions {
    return isString(descriptionOrOptions) ? {} : descriptionOrOptions;
  }

  /**
   * 用于从给定参数中提取错误描述和 httpExceptionOptions 的工具方法。
   * 继承的类使用此方法来正确解析这两个选项。
   * @returns 错误描述和 httpExceptionOptions 作为一个对象返回。
   */
  public static extractDescriptionAndOptionsFrom(
    descriptionOrOptions: string | HttpExceptionOptions,
  ): DescriptionAndOptions {
    const description = isString(descriptionOrOptions)
      ? descriptionOrOptions
      : descriptionOrOptions?.description;

    const httpExceptionOptions = isString(descriptionOrOptions)
      ? {}
      : descriptionOrOptions;

    return {
      description,
      httpExceptionOptions,
    };
  }
}
