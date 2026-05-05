import { Observable } from 'rxjs';
import { ArgumentsHost } from '../features/arguments-host.interface';

/**
 * 描述 RPC 异常过滤器实现的接口。
 *
 * @see [异常过滤器](https://docs.nestjs.cn/microservices/exception-filters)
 *
 * @publicApi
 */
export interface RpcExceptionFilter<T = any, R = any> {
  /**
   * 实现自定义（微服务）异常过滤器的方法。
   *
   * @param exception 被处理的异常类型（类）
   * @param host 用于访问正在处理的消息的参数数组
   */
  catch(exception: T, host: ArgumentsHost): Observable<R>;
}
