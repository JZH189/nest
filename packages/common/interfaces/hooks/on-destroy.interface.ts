/**
 * 定义在 Nest 销毁宿主模块之前调用方法的接口
 *（`app.close()` 方法已被评估）。用于执行资源清理（例如数据库连接）。
 *
 * @see [生命周期事件](https://docs.nestjs.cn/fundamentals/lifecycle-events)
 *
 * @publicApi
 */
export interface OnModuleDestroy {
  onModuleDestroy(): any;
}
