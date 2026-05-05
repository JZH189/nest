/**
 * 定义在应用程序完全启动和引导后调用方法的接口。
 *
 * @see [生命周期事件](https://docs.nestjs.cn/fundamentals/lifecycle-events)
 *
 * @publicApi
 */
export interface OnApplicationBootstrap {
  onApplicationBootstrap(): any;
}
