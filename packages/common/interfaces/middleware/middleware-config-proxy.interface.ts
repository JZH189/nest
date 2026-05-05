import { Type } from '../type.interface';
import { RouteInfo } from './middleware-configuration.interface';
import { MiddlewareConsumer } from './middleware-consumer.interface';

/**
 * @publicApi
 */
export interface MiddlewareConfigProxy {
  /**
   * 从当前中间件中排除的路由。
   *
   * @param {(string | RouteInfo)[]} routes
   * @returns {MiddlewareConfigProxy}
   */
  exclude(...routes: (string | RouteInfo)[]): MiddlewareConfigProxy;

  /**
   * 将路由或控制器附加到当前中间件。
   * 如果传递控制器类，Nest 将把当前中间件附加到其中定义的每个路径。
   *
   * @param {(string | Type | RouteInfo)[]} routes
   * @returns {MiddlewareConsumer}
   */
  forRoutes(...routes: (string | Type<any> | RouteInfo)[]): MiddlewareConsumer;
}
