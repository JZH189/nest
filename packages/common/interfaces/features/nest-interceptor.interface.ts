import { Observable } from 'rxjs';
import { ExecutionContext } from './execution-context.interface';

/**
 * 提供对响应流访问的接口。
 *
 * @see [拦截器](https://docs.nestjs.cn/interceptors)
 *
 * @publicApi
 */
export interface CallHandler<T = any> {
  /**
   * 返回一个表示来自路由处理程序的响应流的 `Observable`。
   */
  handle(): Observable<T>;
}

/**
 * 描述拦截器实现的接口。
 *
 * @see [拦截器](https://docs.nestjs.cn/interceptors)
 *
 * @publicApi
 */

export interface NestInterceptor<T = any, R = any> {
  /**
   * 实现自定义拦截器的方法。
   *
   * @param context 一个 `ExecutionContext` 对象，提供访问即将被调用的
   * 路由处理程序和类的方法。
   * @param next 对 `CallHandler` 的引用，它提供对表示来自路由处理程序的响应流的
   * `Observable` 的访问。
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<R> | Promise<Observable<R>>;
}
