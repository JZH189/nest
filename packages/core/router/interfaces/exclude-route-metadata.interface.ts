import { RequestMethod } from '@nestjs/common';

/**
 * 被排除路由的元数据描述。
 *
 * 在框架中的角色：当使用 @ExcludeRouteMetadata 装饰器（或中间件排除配置）将某个
 * 处理器从路由中排除时，框架会把排除条件（路径、路径正则、HTTP 方法）封装成该结构，
 * 供 PathsExplorer / RouterExplorer 在扫描路由时判断是否跳过对应处理器。
 */
export interface ExcludeRouteMetadata {
  /**
   * Route path.
   */
  path: string;

  /**
   * Regular expression representing the route path.
   */
  pathRegex: RegExp;

  /**
   * HTTP request method (e.g., GET, POST).
   */
  requestMethod: RequestMethod;
}
