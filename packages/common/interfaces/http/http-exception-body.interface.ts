/**
 * HTTP 异常响应体中 message 字段的取值类型。
 */
export type HttpExceptionBodyMessage = string | string[] | number;

/**
 * 描述标准 HTTP 异常响应体的结构。
 * 由各种 HttpException（如 `HttpException`、`BadRequestException` 等）构造，
 * 经异常过滤器序列化后写回响应。
 */
export interface HttpExceptionBody {
  /** 错误消息 */
  message: HttpExceptionBodyMessage;
  /** 错误名称（如 'Bad Request'），可选 */
  error?: string;
  /** HTTP 状态码 */
  statusCode: number;
}
