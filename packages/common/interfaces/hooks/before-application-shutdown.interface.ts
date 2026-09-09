/**
 * 生命周期钩子接口：在收到终止信号（如 SIGTERM）之后、
 * `onApplicationShutdown` 钩子与模块销毁之前被调用（需先调用 `enableShutdownHooks()` 启用）。
 * 由 Nest 生命周期调度器在应用关闭时检测并调用。
 *
 * @see [生命周期事件](https://docs.nestjs.cn/fundamentals/lifecycle-events)
 *
 * @publicApi
 */
export interface BeforeApplicationShutdown {
  /**
   * @param signal 收到的系统关闭信号（如 'SIGTERM'）
   */
  beforeApplicationShutdown(signal?: string): any;
}
