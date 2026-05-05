import { Observable, ReplaySubject, Subject } from 'rxjs';
import { AbstractHttpAdapter } from '../adapters/http-adapter';

/**
 * 定义 `HttpAdapterHost` 对象。
 *
 * `HttpAdapterHost` 包装了底层的平台特定 `HttpAdapter`。`HttpAdapter` 是底层
 * 本机 HTTP 服务器库（例如 Express）的包装器。`HttpAdapterHost` 对象
 * 提供了 `get` 和 `set` 底层 HttpAdapter 的方法。
 *
 * @see [HTTP 适配器](https://docs.nestjs.cn/faq/http-adapter)
 *
 * @publicApi
 */
export class HttpAdapterHost<
  T extends AbstractHttpAdapter = AbstractHttpAdapter,
> {
  private _httpAdapter?: T;
  private _listen$ = new Subject<void>();
  private _init$ = new ReplaySubject<void>();
  private isListening = false;

  /**
   * 底层 `HttpAdapter` 的访问器
   *
   * @param httpAdapter 要设置的 `HttpAdapter` 的引用
   */
  set httpAdapter(httpAdapter: T) {
    this._httpAdapter = httpAdapter;

    this._init$.next();
    this._init$.complete();
  }

  /**
   * 底层 `HttpAdapter` 的访问器
   *
   * @example
   * `const httpAdapter = adapterHost.httpAdapter;`
   */
  get httpAdapter(): T {
    return this._httpAdapter as T;
  }

  /**
   * 允许订阅 `listen` 事件的可观察对象。
   * 当 HTTP 应用程序正在监听传入请求时发出此事件。
   */
  get listen$(): Observable<void> {
    return this._listen$.asObservable();
  }

  /**
   * 允许订阅 `init` 事件的可观察对象。
   * 当 HTTP 应用程序初始化时发出此事件。
   */
  get init$(): Observable<void> {
    return this._init$.asObservable();
  }

  /**
   * 设置应用程序的监听状态。
   */
  set listening(listening: boolean) {
    this.isListening = listening;

    if (listening) {
      this._listen$.next();
      this._listen$.complete();
    }
  }

  /**
   * 返回一个布尔值，指示应用程序是否正在监听传入请求。
   */
  get listening(): boolean {
    return this.isListening;
  }
}
