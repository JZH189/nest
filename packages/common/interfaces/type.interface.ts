/**
 * 表示一个类的构造函数类型，是 Nest 中最常用的"类型"引用形式：
 * 既是提供者/控制器的注册方式，也可直接作为注入令牌使用。
 */
export interface Type<T = any> extends Function {
  new (...args: any[]): T;
}
