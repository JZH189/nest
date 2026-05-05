/**
 * 定义在宿主模块初始化后调用方法的接口。
 *
 * @see [生命周期事件](https://docs.nestjs.cn/fundamentals/lifecycle-events)
 *
 * @publicApi
 */
export interface OnModuleInit {
  onModuleInit(): any;
}
