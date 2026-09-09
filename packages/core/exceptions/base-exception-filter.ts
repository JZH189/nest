import {
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  HttpServer,
  HttpStatus,
  Inject,
  IntrinsicException,
  Logger,
  Optional,
} from '@nestjs/common';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { AbstractHttpAdapter } from '../adapters';
import { MESSAGES } from '../constants';
import { HttpAdapterHost } from '../helpers/http-adapter-host';

/**
 * 异常过滤器基类，所有内置异常处理流程的兜底实现。
 *
 * 在框架中的角色：当没有任何 @Catch() 过滤器能处理当前异常时，
 * ExceptionsHandler / ExternalExceptionsHandler 最终都会退回到
 * BaseExceptionFilter 的 catch 逻辑。它负责：
 * 1. 把 HttpException（或 http-errors 库风格的对象）转换为带状态码的响应体；
 * 2. 把未知异常统一转换成 500 内部服务器错误；
 * 3. 在响应头已发送的情况下安全地结束响应而不是再次写入。
 *
 * 通过 @Optional() @Inject() 注入 HttpAdapterHost，以便在脱离 HTTP
 * 服务上下文（如微服务、CLI 环境）时也能优雅降级。
 */
export class BaseExceptionFilter<T = any> implements ExceptionFilter<T> {
  private static readonly logger = new Logger('ExceptionsHandler');

  @Optional()
  @Inject()
  protected readonly httpAdapterHost?: HttpAdapterHost;

  constructor(protected readonly applicationRef?: HttpServer) {}

  /**
   * 异常处理入口，实现 ExceptionFilter 接口。
   * @param exception - 请求处理过程中抛出的异常
   * @param host - ArgumentsHost，用于获取请求/响应等参数对象
   */
  catch(exception: T, host: ArgumentsHost) {
    // 优先使用构造时传入的 applicationRef，否则从 HttpAdapterHost 中取当前 HTTP 适配器
    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter)!;

    // 非 HttpException 的异常一律按未知异常处理（返回 500）
    if (!(exception instanceof HttpException)) {
      return this.handleUnknownError(exception, host, applicationRef);
    }
    const res = exception.getResponse();
    const message = isObject(res)
      ? res
      : {
          statusCode: exception.getStatus(),
          message: res,
        };

    const response = host.getArgByIndex(1);
    if (!applicationRef.isHeadersSent(response)) {
      // 响应头未发送：按异常携带的状态码写回响应体
      applicationRef.reply(response, message, exception.getStatus());
    } else {
      // 响应头已发送：只能直接结束连接，避免二次写入报错
      applicationRef.end(response);
    }
  }

  /**
   * 处理未知类型异常：统一转换为 500 内部服务器错误响应。
   * @param exception - 抛出的异常对象
   * @param host - ArgumentsHost，用于获取响应对象
   * @param applicationRef - 当前使用的 HTTP 适配器或服务器实例
   */
  public handleUnknownError(
    exception: T,
    host: ArgumentsHost,
    applicationRef: AbstractHttpAdapter | HttpServer,
  ) {
    // 兼容 http-errors 库风格（带 statusCode/message），否则统一返回 500 与通用错误文案
    const body = this.isHttpError(exception)
      ? {
          statusCode: exception.statusCode,
          message: exception.message,
        }
      : {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
        };

    const response = host.getArgByIndex(1);
    if (!applicationRef.isHeadersSent(response)) {
      applicationRef.reply(response, body, body.statusCode);
    } else {
      applicationRef.end(response);
    }

    // 框架内部异常（如路由未找到等 IntrinsicException）不再重复记录日志
    if (!(exception instanceof IntrinsicException)) {
      BaseExceptionFilter.logger.error(exception);
    }
  }

  /**
   * 判断传入的对象是否可作为 Error 对象处理（即拥有 message 属性的普通对象）。
   * @param err - 待检查的对象
   * @returns 若为带 message 属性的对象则返回 true
   */
  public isExceptionObject(err: any): err is Error {
    return isObject(err) && !!(err as Error).message;
  }

  /**
   * Checks if the thrown error comes from the "http-errors" library.
   * @param err error object
   */
  public isHttpError(err: any): err is { statusCode: number; message: string } {
    return err?.statusCode && err?.message;
  }
}
