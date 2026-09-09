import { RequestMethod } from '@nestjs/common';
import { addLeadingSlash } from '@nestjs/common/utils/shared.utils';
import { ExcludeRouteMetadata } from '../interfaces/exclude-route-metadata.interface';

/**
 * 判断请求方法是否为"全部方法"（RequestMethod.ALL 或 -1，后者常见于
 * 未指定请求方法的排除规则）。
 *
 * @param method - 待判断的请求方法。
 * @returns 表示所有方法时返回 true。
 */
export const isRequestMethodAll = (method: RequestMethod) => {
  return RequestMethod.ALL === method || (method as number) === -1;
};

/**
 * 判断指定路由是否命中排除规则（setGlobalPrefix 的 exclude 配置）。
 *
 * @param excludedRoutes - 排除规则元数据列表（路径正则 + 请求方法）。
 * @param path - 当前路由路径。
 * @param requestMethod - 当前请求方法。
 * @returns 任一规则的请求方法匹配且路径正则命中时返回 true。
 */
export function isRouteExcluded(
  excludedRoutes: ExcludeRouteMetadata[],
  path: string,
  requestMethod?: RequestMethod,
) {
  return excludedRoutes.some(route => {
    if (
      isRequestMethodAll(route.requestMethod) ||
      route.requestMethod === requestMethod
    ) {
      return route.pathRegex.exec(addLeadingSlash(path));
    }
    return false;
  });
}
