import { Scope } from '../scope-options.interface';

/**
 * @publicApi
 */
export interface IntrospectionResult {
  /**
   * 定义宿主类或工厂生命周期的枚举。
   */
  scope: Scope;
}
