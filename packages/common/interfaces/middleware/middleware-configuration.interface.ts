import { RequestMethod } from '../../enums';
import { Type } from '../type.interface';
import { VersionValue } from '../version-options.interface';

/**
 * 描述一条路由信息（路径 + 请求方法 + 可选版本）。
 * 既用于中间件的 `forRoutes()` / `exclude()`，也广泛用于核心包的路由注册与扫描。
 */
export interface RouteInfo {
  /** 路由路径（支持通配符，如 `*` 或 `cats/*`） */
  path: string;
  /** 请求方法 */
  method: RequestMethod;
  /** 该路由绑定的 API 版本 */
  version?: VersionValue;
}

/**
 * 描述一条中间件配置：将某个中间件应用（类/名称）与它作用的路由集合关联。
 * 由中间件模块（MiddlewareModule）消费，用于把中间件注册到底层 HTTP 适配器。
 */
export interface MiddlewareConfiguration<T = any> {
  /** 中间件类（或类数组/名称） */
  middleware: T;
  /** 该中间件要应用到的路由（控制器类、路径或路由信息） */
  forRoutes: (Type<any> | string | RouteInfo)[];
}
