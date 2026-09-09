/**
 * 所有传输层 RPC 上下文宿主的基类。
 * 持有传给消息处理器的原始参数数组（各传输层的具体上下文类按约定排列这些参数），
 * 用户通过 @Ctx() 注入的上下文对象均继承自此类。
 *
 * @publicApi
 */
export class BaseRpcContext<T = unknown[]> {
  /**
   * @param args - 传给处理器的参数数组（含义由子类约定）
   */
  constructor(protected readonly args: T) {}

  /**
   * 返回传给处理器的完整参数数组。
   */
  getArgs(): T {
    return this.args;
  }

  /**
   * 按索引返回某个参数。
   * @param index - 参数索引
   */
  getArgByIndex(index: number) {
    return this.args[index];
  }
}
