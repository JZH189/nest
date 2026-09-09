import { ArgumentsHost, IntrinsicException, Logger } from '@nestjs/common';

/**
 * 外部路由使用的兜底异常过滤器。
 *
 * 在框架中的角色：ExternalExceptionsHandler 在没有自定义过滤器命中时，
 * 会退回本过滤器。与 BaseExceptionFilter 不同的是，它不负责把异常写入
 * HTTP 响应（外部路由场景下没有框架托管的响应对象），而是先记录日志，
 * 再将异常原样重新抛出，交由适配器层或全局兜底逻辑处理。
 */
export class ExternalExceptionFilter<T = any, R = any> {
  private static readonly logger = new Logger('ExceptionsHandler');

  /**
   * 异常处理入口：记录错误日志后重新抛出异常。
   * @param exception - 抛出的异常
   * @param host - ArgumentsHost，提供请求上下文参数
   * @returns 一般不会正常返回；异常总会被重新抛出
   */
  catch(exception: T, host: ArgumentsHost): R | Promise<R> {
    if (
      exception instanceof Error &&
      !(exception instanceof IntrinsicException)
    ) {
      // 框架内部异常（如路由未找到）不重复记录日志，其余 Error 统一记为错误日志
      ExternalExceptionFilter.logger.error(exception);
    }

    throw exception;
  }
}
