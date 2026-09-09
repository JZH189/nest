import { Scope } from '../scope-options.interface';

/**
 * 提供者自省（introspection）的结果，可通过 `Scope` 相关工具
 * 查询某个类/提供者声明的作用域信息。
 *
 * @publicApi
 */
export interface IntrospectionResult {
  /**
   * 定义宿主类或工厂生命周期的枚举。
   */
  scope: Scope;
}
