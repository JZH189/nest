import { ArgumentsHost } from '../features/arguments-host.interface';

/**
 * 描述异常过滤器实现的接口。
 *
 * @see [异常过滤器](https://docs.nestjs.cn/exception-filters)
 *
 * @publicApi
 */
export interface ExceptionFilter<T = any> {
  /**
   * 实现自定义异常过滤器的方法。
   *
   * @param exception 被处理的异常类
   * @param host 用于访问正在处理的请求参数数组
   */
  catch(exception: T, host: ArgumentsHost): any;
}
