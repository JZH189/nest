import { Abstract } from '../abstract.interface';
import { Type } from '../type.interface';

/**
 * 注入令牌的类型：DI 容器中提供者的唯一标识。
 * 可以是类（Type/Abstract）、字符串或 symbol，容器依据令牌查找并注入对应实例。
 *
 * @publicApi
 */
export type InjectionToken<T = any> =
  | string
  | symbol
  | Type<T>
  | Abstract<T>
  | Function;
