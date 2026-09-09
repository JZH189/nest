import { PARAMTYPES_METADATA } from '../../constants';

/**
 * 递归拍平嵌套数组工具函数。
 *
 * 用于将 `Dependencies()` 接收的可能是嵌套数组的依赖列表
 * （如 `[[Foo, Bar], Baz]`）展平为一维数组，以便写入元数据。
 *
 * @param arr - 可能包含嵌套数组的依赖数组
 * @returns 拍平后的一维数组
 */
export function flatten<T extends Array<unknown> = any>(
  arr: T,
): T extends Array<infer R> ? R : never {
  const flat = ([] as any[]).concat(...arr);
  return flat.some(Array.isArray)
    ? flatten(flat)
    : (flat as T extends Array<infer R> ? R : never);
}

/**
 * 设置所需依赖的装饰器(需要使用普通 JavaScript 对象)
 *
 * @publicApi
 */
export const Dependencies = (
  ...dependencies: Array<unknown>
): ClassDecorator => {
  const flattenDeps = flatten(dependencies);
  return (target: object) => {
    Reflect.defineMetadata(PARAMTYPES_METADATA, flattenDeps, target);
  };
};
