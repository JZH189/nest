/**
 * 抽象类的类型约束。可被用作注入令牌（如 `InjectionToken` 的一种形式），
 * 表示一个不能被直接实例化、只能被子类继承的基类。
 */
export interface Abstract<T> extends Function {
  prototype: T;
}
