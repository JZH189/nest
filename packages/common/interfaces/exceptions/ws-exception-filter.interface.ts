import { ArgumentsHost } from '../features/arguments-host.interface';

/**
 * 描述 WebSocket 异常过滤器实现的接口。
 *
 * @see [异常过滤器](https://docs.nestjs.cn/websockets/exception-filters)
 *
 * @publicApi
 */

export interface WsExceptionFilter<T = any> {
  /**
   * 实现自定义（WebSocket）异常过滤器的方法。
   *
   * @param exception 被处理的异常类型（类）
   * @param host 用于访问正在处理的消息的参数数组
   */
  catch(exception: T, host: ArgumentsHost): any;
}
