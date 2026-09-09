/**
 * Similar to `Object.assign` but copying properties descriptors from `source`
 * as well.
 *
 * 与 `Object.assign` 类似的工具函数，但它复制的是源对象的属性描述符
 * （Property Descriptor）而非单纯的值。这一点对 REPL 至关重要：
 * globalScope 上的 `help` getter 等访问器属性只有以描述符方式复制，
 * 才能在 replServer.context 上继续生效（用户输入 `<fn>.help` 时动态打印帮助）。
 *
 * @param target - 目标对象（REPL 服务器的 context）。
 * @param source - 来源对象（ReplContext 的 globalScope）。
 * @returns 合并后的目标对象（类型上为 T 与 U 的交叉类型）。
 */
export function assignToObject<T, U extends object>(
  target: T,
  source: U,
): T & U {
  Object.defineProperties(
    target,
    Object.keys(source).reduce((descriptors, key) => {
      descriptors[key] = Object.getOwnPropertyDescriptor(source, key);
      return descriptors;
    }, Object.create(null)),
  );
  return target as T & U;
}
