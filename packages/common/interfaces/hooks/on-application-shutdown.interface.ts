/**
 * 定义响应系统信号的方法的接口（当应用程序被关闭时，例如通过 SIGTERM）
 *
 * @see [生命周期事件](https://docs.nestjs.cn/fundamentals/lifecycle-events)
 *
 * @publicApi
 */
export interface OnApplicationShutdown {
  onApplicationShutdown(signal?: string): any;
}
