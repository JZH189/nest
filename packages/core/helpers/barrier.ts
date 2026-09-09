/**
 * 一个简单的屏障（Barrier），用于同步多个异步操作的执行流程。
 *
 * 在框架中的角色：请求级作用域实例（REQUEST / 请求级多例）销毁时，
 * 需要等待所有并发使用该实例的请求都完成后才能安全清理，
 * injector 中的“请求宿主”机制会借助该屏障统计引用并等待全部释放。
 */
export class Barrier {
  private currentCount: number;
  private targetCount: number;
  private promise: Promise<void>;
  private resolve: () => void;

  /**
   * @param targetCount - 需要到达屏障的参与者数量，达到后屏障解除
   */
  constructor(targetCount: number) {
    this.currentCount = 0;
    this.targetCount = targetCount;

    this.promise = new Promise<void>(resolve => {
      // 保存 resolve 引用，供 signal() 在计数达标时解除屏障
      this.resolve = resolve;
    });
  }

  /**
   * 通知屏障：一个参与者已到达。
   * 当 `targetCount` 个参与者都到达后，屏障解除。
   */
  public signal(): void {
    this.currentCount += 1;
    if (this.currentCount === this.targetCount) {
      this.resolve();
    }
  }

  /**
   * 等待屏障解除。
   *
   * @returns 屏障解除时兑现的 Promise
   */
  public async wait(): Promise<void> {
    return this.promise;
  }

  /**
   * 通知屏障并等待其解除（signal + wait 的组合操作）。
   *
   * @returns 屏障解除时兑现的 Promise
   */
  public async signalAndWait(): Promise<void> {
    this.signal();
    return this.wait();
  }
}
