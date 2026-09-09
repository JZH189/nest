/**
 * 判断给定值是否为 undefined。
 *
 * @param obj 待判断的值
 * @returns 若为 undefined 则返回 `true`
 */
export const isUndefined = (obj: any): obj is undefined =>
  typeof obj === 'undefined';

/**
 * 判断给定值是否为对象（非 null、非 undefined 且 typeof 为 "object"）。
 * 注意：数组、Date 等也会被判定为 true。
 *
 * @param fn 待判断的值
 * @returns 若为对象则返回 `true`
 */
export const isObject = (fn: any): fn is object =>
  !isNil(fn) && typeof fn === 'object';

/**
 * 判断给定值是否为"普通对象"（plain object），
 * 即原型为 Object.prototype（或原型链为 null，如 Object.create(null)）、
 * 由 Object 构造函数或对象字面量创建的对象。类实例、Date、Map 等均不算。
 *
 * @param fn 待判断的值
 * @returns 若为普通对象则返回 `true`
 */
export const isPlainObject = (fn: any): fn is object => {
  if (!isObject(fn)) {
    return false;
  }
  // 1. 取出对象的原型
  const proto = Object.getPrototypeOf(fn);
  // 2. 原型为 null（如 Object.create(null) 的结果）视为普通对象
  if (proto === null) {
    return true;
  }
  // 3. 取出原型上的构造函数
  const ctor =
    Object.prototype.hasOwnProperty.call(proto, 'constructor') &&
    proto.constructor;
  // 4. 构造函数必须是函数，且其 toString 与 Object 构造函数完全一致，
  //    说明原型确实来自 Object.prototype（而非自定义类）
  return (
    typeof ctor === 'function' &&
    ctor instanceof ctor &&
    Function.prototype.toString.call(ctor) ===
      Function.prototype.toString.call(Object)
  );
};

/**
 * 规范化路径：确保路径以 "/" 开头。
 * 特别处理：若路径以 "{/" 开头（路由参数如 "{/:id}" 的情形），则不再追加前导斜杠。
 *
 * @param path 原始路径
 * @returns 以 "/" 开头的路径；输入非字符串时返回空字符串
 */
export const addLeadingSlash = (path?: string): string =>
  path && typeof path === 'string'
    ? path.charAt(0) !== '/' && path.substring(0, 2) !== '{/'
      ? '/' + path
      : path
    : '';

/**
 * 规范化路由路径：确保以 "/" 开头，并移除末尾多余的斜杠、
 * 合并路径中重复的斜杠（如 "a//b///" -> "/a/b"）。
 *
 * @param path 原始路径
 * @returns 规范化后的路径；输入为空时返回 "/"
 */
export const normalizePath = (path?: string): string =>
  path
    ? path.startsWith('/')
      ? ('/' + path.replace(/\/+$/, '')).replace(/\/+/g, '/')
      : '/' + path.replace(/\/+$/, '')
    : '/';

/**
 * 移除路径末尾的一个斜杠（如果存在）。
 *
 * @param path 原始路径
 * @returns 去掉末尾斜杠后的路径
 */
export const stripEndSlash = (path: string) =>
  path[path.length - 1] === '/' ? path.slice(0, path.length - 1) : path;

/**
 * 判断给定值是否为函数。
 *
 * @param val 待判断的值
 * @returns 若为函数则返回 `true`
 */
export const isFunction = (val: any): val is Function =>
  typeof val === 'function';
/**
 * 判断给定值是否为 string 类型。
 *
 * @param val 待判断的值
 * @returns 若为字符串则返回 `true`
 */
export const isString = (val: any): val is string => typeof val === 'string';
/**
 * 判断给定值是否为 number 类型。
 *
 * @param val 待判断的值
 * @returns 若为数字则返回 `true`
 */
export const isNumber = (val: any): val is number => typeof val === 'number';
/**
 * 判断给定值（通常是对象属性键）是否为字符串 "constructor"。
 *
 * @param val 待判断的值
 * @returns 若等于 "constructor" 则返回 `true`
 */
export const isConstructor = (val: any): boolean => val === 'constructor';
/**
 * 判断给定值是否为 null 或 undefined（"空值"）。
 *
 * @param val 待判断的值
 * @returns 若为 null/undefined 则返回 `true`
 */
export const isNil = (val: any): val is null | undefined =>
  isUndefined(val) || val === null;
/**
 * 判断给定的数组（或类数组）是否为空。
 *
 * @param array 待判断的数组
 * @returns 若数组不存在或长度为 0 则返回 `true`
 */
export const isEmpty = (array: any): boolean => !(array && array.length > 0);
/**
 * 判断给定值是否为 symbol 类型。
 *
 * @param val 待判断的值
 * @returns 若为 symbol 则返回 `true`
 */
export const isSymbol = (val: any): val is symbol => typeof val === 'symbol';
