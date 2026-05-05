import { Type } from '../type.interface';
import { MiddlewareConfigProxy } from './middleware-config-proxy.interface';

/**
 * 定义将用户定义的中间件应用到路由的方法的接口。
 *
 * @see [MiddlewareConsumer](https://docs.nestjs.cn/middleware#middleware-consumer)
 *
 * @publicApi
 */
export interface MiddlewareConsumer {
  /**
   * @param {...(Type | Function)} middleware 要附加到传递路由的中间件类/函数或类/函数数组。
   *
   * @returns {MiddlewareConfigProxy}
   */
  apply(...middleware: (Type<any> | Function)[]): MiddlewareConfigProxy;
}
