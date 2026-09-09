/**
 * SettlementSignal is used to signal the resolution of a provider/instance.
 * Calling `complete` or `error` will resolve the promise returned by `asPromise`.
 * Can be used to detect circular dependencies.
 *
 * 实例化完成信号：每个正在实例化的 wrapper 会挂载一个信号对象，
 * 并发请求可通过 asPromise() 等待同一次实例化完成；
 * 通过记录依赖引用（insertRef）还可用于循环依赖检测（isCycle）。
 */
export class SettlementSignal {
  /** 本信号宿主所依赖的其他 wrapper ID 集合（循环检测用） */
  private readonly _refs = new Set();
  /** 结算 Promise：complete/error 时被 resolve/reject */
  private readonly settledPromise: Promise<unknown>;
  /** 用于结算 Promise 的 resolve 函数 */
  private settleFn!: (err?: unknown) => void;
  /** 信号是否已结算（完成或出错） */
  private completed = false;

  constructor() {
    this.settledPromise = new Promise<unknown>(resolve => {
      this.settleFn = resolve;
    });
  }

  /**
   * Resolves the promise returned by `asPromise`.
   */
  public complete() {
    this.completed = true;
    this.settleFn();
  }

  /**
   * Rejects the promise returned by `asPromise` with the given error.
   * @param err Error to reject the promise returned by `asPromise` with.
   */
  public error(err: unknown) {
    this.completed = true;
    this.settleFn(err);
  }

  /**
   * Returns a promise that will be resolved when `complete` or `error` is called.
   * @returns Promise that will be resolved when `complete` or `error` is called.
   */
  public asPromise() {
    return this.settledPromise;
  }

  /**
   * Inserts a wrapper id that the host of this signal depends on.
   * @param wrapperId Wrapper id to insert.
   */
  public insertRef(wrapperId: string) {
    this._refs.add(wrapperId);
  }

  /**
   * Check if relationship is circular.
   * @param wrapperId Wrapper id to check.
   * @returns True if relationship is circular, false otherwise.
   */
  public isCycle(wrapperId: string) {
    return !this.completed && this._refs.has(wrapperId);
  }
}
