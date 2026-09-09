import { RequestMethod } from '@nestjs/common';
import { HttpServer, RouteInfo, Type } from '@nestjs/common/interfaces';
import {
  addLeadingSlash,
  isFunction,
  isString,
} from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { pathToRegexp } from 'path-to-regexp';
import { uid } from 'uid';
import { ExcludeRouteMetadata } from '../router/interfaces/exclude-route-metadata.interface';
import { LegacyRouteConverter } from '../router/legacy-route-converter';
import { isRouteExcluded } from '../router/utils';

/**
 * 把排除路由（字符串或 RouteInfo）转换为 ExcludeRouteMetadata：
 * 兼容旧版通配符语法的转换，并用 path-to-regexp 生成匹配正则，
 * 供运行时判断请求是否命中被排除的路由。
 *
 * @param routes - 要排除的路由列表。
 * @returns 排除路由元数据数组（含路径、请求方法与正则）。
 */
export const mapToExcludeRoute = (
  routes: (string | RouteInfo)[],
): ExcludeRouteMetadata[] => {
  return routes.map(route => {
    const originalPath = isString(route) ? route : route.path;
    const path = LegacyRouteConverter.tryConvert(originalPath);

    try {
      if (isString(route)) {
        return {
          path,
          requestMethod: RequestMethod.ALL,
          pathRegex: pathToRegexp(addLeadingSlash(path)).regexp,
        };
      }
      return {
        path,
        requestMethod: route.method,
        pathRegex: pathToRegexp(addLeadingSlash(path)).regexp,
      };
    } catch (e) {
      if (e instanceof TypeError) {
        LegacyRouteConverter.printError(originalPath);
      }
      throw e;
    }
  });
};

/**
 * 过滤并规范化中间件集合：剔除非函数项，把每个中间件（类或函数）
 * 包装为带排除路由判断的类形式，确保 exclude() 规则生效。
 *
 * @param middleware - 中间件列表（类或函数式）。
 * @param routes - 被排除的路由（RouteInfo 形式）。
 * @param httpAdapter - 底层 HTTP 适配器。
 * @returns 规范化后的中间件类数组。
 */
export const filterMiddleware = <T extends Function | Type<any> = any>(
  middleware: T[],
  routes: RouteInfo[],
  httpAdapter: HttpServer,
) => {
  const excludedRoutes = mapToExcludeRoute(routes);
  return iterate([])
    .concat(middleware)
    .filter(isFunction)
    .map((item: T) => mapToClass(item, excludedRoutes, httpAdapter))
    .toArray();
};

/**
 * 将中间件（类或函数）映射为统一的"类"形态，并在请求进入时
 * 判断是否命中被排除路由：命中则直接 next() 跳过，否则执行原中间件。
 * 类形式的中间件通过继承并覆写 use 实现；函数式的中间件包装成新类。
 *
 * @param middleware - 原始中间件（类或函数）。
 * @param excludedRoutes - 被排除的路由元数据。
 * @param httpAdapter - 底层 HTTP 适配器。
 * @returns 包装后的中间件类。
 */
export const mapToClass = <T extends Function | Type<any>>(
  middleware: T,
  excludedRoutes: ExcludeRouteMetadata[],
  httpAdapter: HttpServer,
) => {
  if (isMiddlewareClass(middleware)) {
    if (excludedRoutes.length <= 0) {
      return middleware;
    }
    const MiddlewareHost = class extends middleware {
      use(...params: unknown[]) {
        const [req, _, next] = params as [Record<string, any>, any, Function];
        const isExcluded = isMiddlewareRouteExcluded(
          req,
          excludedRoutes,
          httpAdapter,
        );
        if (isExcluded) {
          return next();
        }
        return super.use(...params);
      }
    };
    return assignToken(MiddlewareHost, middleware.name);
  }
  return assignToken(
    class {
      use = (...params: unknown[]) => {
        const [req, _, next] = params as [Record<string, any>, any, Function];
        const isExcluded = isMiddlewareRouteExcluded(
          req,
          excludedRoutes,
          httpAdapter,
        );
        if (isExcluded) {
          return next();
        }
        return (middleware as Function)(...params);
      };
    },
  );
};

/**
 * 判断传入的中间件是否为"类"形式：
 * 1. 序列化后以 class 开头，或
 * 2. 是首字母大写的构造函数且其原型上有 use 方法。
 *
 * @param middleware - 待判断的中间件。
 * @returns 是类形式时返回 true。
 */
export function isMiddlewareClass(middleware: any): middleware is Type<any> {
  const middlewareStr = middleware.toString();
  if (middlewareStr.substring(0, 5) === 'class') {
    return true;
  }
  const middlewareArr = middlewareStr.split(' ');
  return (
    middlewareArr[0] === 'function' &&
    /[A-Z]/.test(middlewareArr[1]?.[0]) &&
    isFunction(middleware.prototype?.use)
  );
}

/**
 * 为（包装后的）中间件类指定 name 属性作为 token：
 * 未提供时生成随机 uid，保证依赖注入系统中标识唯一。
 *
 * @param metatype - 中间件类。
 * @param token - 可选的名称 token。
 * @returns 指定了 name 的同一个类。
 */
export function assignToken(metatype: Type<any>, token = uid(21)): Type<any> {
  Object.defineProperty(metatype, 'name', { value: token });
  return metatype;
}

/**
 * 判断当前请求是否命中被排除的路由：读取请求方法与 URL
 * （去掉查询串后）与排除路由正则比对。
 *
 * @param req - 请求对象。
 * @param excludedRoutes - 被排除的路由元数据。
 * @param httpAdapter - 底层 HTTP 适配器。
 * @returns 命中排除规则时返回 true（应跳过该中间件）。
 */
export function isMiddlewareRouteExcluded(
  req: Record<string, any>,
  excludedRoutes: ExcludeRouteMetadata[],
  httpAdapter: HttpServer,
): boolean {
  if (excludedRoutes.length <= 0) {
    return false;
  }
  const reqMethod = httpAdapter.getRequestMethod!(req);
  const originalUrl = httpAdapter.getRequestUrl!(req);
  const queryParamsIndex = originalUrl ? originalUrl.indexOf('?') : -1;
  const pathname =
    queryParamsIndex >= 0
      ? originalUrl.slice(0, queryParamsIndex)
      : originalUrl;

  return isRouteExcluded(excludedRoutes, pathname, RequestMethod[reqMethod]);
}
