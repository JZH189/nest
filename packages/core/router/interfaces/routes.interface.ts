import { Type } from '@nestjs/common';

/**
 * 路由树节点定义，用于 RouterModule#register 以树形结构声明模块路由。
 *
 * - path - 该层级的路由路径前缀；
 * - module - 挂载在该路径下的模块；
 * - children - 子路由树，可以继续嵌套 RouteTree 或直接是模块类型。
 */
export interface RouteTree {
  path: string;
  module?: Type<any>;
  children?: (RouteTree | Type<any>)[];
}

/**
 * 路由树数组类型，即传给 RouterModule#register 的一组路由声明。
 */
export type Routes = RouteTree[];
