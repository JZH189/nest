import { PARAMTYPES_METADATA } from '../../constants';

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
