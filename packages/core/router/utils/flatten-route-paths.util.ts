import { Type } from '@nestjs/common';
import { isString, normalizePath } from '@nestjs/common/utils/shared.utils';
import { Routes } from '../interfaces/routes.interface';

/**
 * 递归展平路由树（Routes），为每个叶子模块计算从根到它的完整路径。
 *
 * 在框架中的角色：RouterModule#register 传入的 RouteTree 可能多层嵌套，
 * 该工具在初始化时把树展开为 [{ module, path }] 列表，并把子树路径
 * 规范化地拼接上父路径，供后续写入 MODULE_PATH 元数据使用。
 *
 * @param routes - 路由树（可嵌套）。
 * @returns 展平后的 { module, path } 数组，path 为拼接父路径后的完整路径。
 */
export function flattenRoutePaths(routes: Routes) {
  const result: Array<{
    module: Type;
    path: string;
  }> = [];
  routes.forEach(item => {
    if (item.module && item.path) {
      result.push({ module: item.module, path: item.path });
    }
    if (item.children) {
      const childrenRef = item.children as Routes;
      childrenRef.forEach(child => {
        if (!isString(child) && isString(child.path)) {
          child.path = normalizePath(
            normalizePath(item.path) + normalizePath(child.path),
          );
        } else {
          result.push({ path: item.path, module: child as any as Type });
        }
      });
      result.push(...flattenRoutePaths(childrenRef));
    }
  });
  return result;
}
