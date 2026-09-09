/**
 * @publicApi
 *
 * OverrideBy.useFactory 的选项：工厂函数本身 + 可选的注入 token 数组
 * （factory 的入参按 inject 数组的顺序解析注入，类似普通 provider 的
 * useFactory 用法）。
 */
export interface OverrideByFactoryOptions {
  /** 工厂函数：返回用作替代实现的实例 */
  factory: (...args: any[]) => any;
  /** 工厂参数依赖的注入 token 列表，与 factory 的形参一一对应 */
  inject?: any[];
}
