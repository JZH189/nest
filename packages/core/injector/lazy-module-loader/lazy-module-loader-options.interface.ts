/**
 * LazyModuleLoader.load 的加载选项
 */
export interface LazyModuleLoaderLoadOptions {
  /**
   * If `false`, no logs will be generated when loading some module lazily.
   *
   * 设为 false 时，懒加载模块过程中不会输出任何日志。
   */
  logger?: boolean;
}
