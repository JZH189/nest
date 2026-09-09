import { HttpStatus } from '../../enums';

/**
 * 描述 HTTP 重定向响应的参数。由 `@Res()` 搭配响应对象的 `redirect()` 方法，
 * 或通过 `HttpException` 机制发起重定向时使用。
 */
export interface HttpRedirectResponse {
  /** 重定向目标地址 */
  url: string;
  /** 重定向使用的 HTTP 状态码（如 301、302、307） */
  statusCode: HttpStatus;
}
