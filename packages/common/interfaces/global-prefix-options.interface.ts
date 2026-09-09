import { RouteInfo } from './middleware';

/**
 * 全局路由前缀的选项，由 `app.setGlobalPrefix()` 的第二个参数传入，
 * 供核心包中的路由映射器消费。
 *
 * @publicApi
 */
export interface GlobalPrefixOptions<T = string | RouteInfo> {
  /** 从全局前缀中排除的路由（路径或路由信息对象） */
  exclude?: T[];
}
