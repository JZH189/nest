import { HttpStatus } from '../enums/http-status.enum';
import { HttpException, HttpExceptionOptions } from './http.exception';

/**
 * 定义 *Unprocessable Entity* 类型错误的 HTTP 异常。
 *
 * @see [内置 HTTP 异常](https://docs.nestjs.cn/exception-filters#built-in-http-exceptions)
 *
 * @publicApi
 */
export class UnprocessableEntityException extends HttpException {
  /**
   * 创建一个 `UnprocessableEntityException` 异常实例。
   *
   * @example
   * `throw new UnprocessableEntityException()`
   *
   * @usageNotes
   * HTTP 响应状态码将为 422。
   * - `objectOrError` 参数定义 JSON 响应体或消息字符串。
   * - `descriptionOrOptions` 参数包含 HTTP 错误的简短描述或用于提供底层错误原因的对象。
   *
   * 默认情况下，JSON 响应体包含两个属性：
   * - `statusCode`：这将是值 422。
   * - `message`：默认为字符串 `'Unprocessable Entity'`；通过在 `objectOrError` 参数中提供字符串来覆盖。
   *
   * 如果参数 `objectOrError` 是一个字符串，响应体将包含一个附加属性 `error`，包含 HTTP 错误的简短描述。
   * 要覆盖整个 JSON 响应体，请改为传递一个对象。Nest 将序列化该对象并将其作为 JSON 响应体返回。
   *
   * @param objectOrError 描述错误条件的字符串或对象。
   * @param descriptionOrOptions HTTP 错误的简短描述或用于提供底层错误原因的对象
   */
  constructor(
    objectOrError?: any,
    descriptionOrOptions:
      | string
      | HttpExceptionOptions = 'Unprocessable Entity',
  ) {
    const { description, httpExceptionOptions } =
      HttpException.extractDescriptionAndOptionsFrom(descriptionOrOptions);

    super(
      HttpException.createBody(
        objectOrError,
        description!,
        HttpStatus.UNPROCESSABLE_ENTITY,
      ),
      HttpStatus.UNPROCESSABLE_ENTITY,
      httpExceptionOptions,
    );
  }
}
