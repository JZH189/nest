import { Observable } from 'rxjs';
import { ExceptionFilter } from './exceptions/exception-filter.interface';
import { CanActivate } from './features/can-activate.interface';
import { NestInterceptor } from './features/nest-interceptor.interface';
import { PipeTransform } from './features/pipe-transform.interface';
import { INestApplicationContext } from './nest-application-context.interface';
import { WebSocketAdapter } from './websockets/web-socket-adapter.interface';

/**
 * 描述微服务上下文的接口。
 *
 * @publicApi
 */
export interface INestMicroservice extends INestApplicationContext {
  /**
   * 启动微服务。
   *
   * @returns {void}
   */
  listen(): Promise<any>;

  /**
   * 注册将用于网关的 WebSocket 适配器。
   * 用于覆盖默认的 `socket.io` 库。
   *
   * @param {WebSocketAdapter} adapter
   * @returns {this}
   */
  useWebSocketAdapter(adapter: WebSocketAdapter): this;

  /**
   * 注册全局异常过滤器(将用于每个模式处理程序)。
   *
   * @param {...ExceptionFilter} filters
   */
  useGlobalFilters(...filters: ExceptionFilter[]): this;

  /**
   * 注册全局管道(将用于每个模式处理程序)。
   *
   * @param {...PipeTransform} pipes
   */
  useGlobalPipes(...pipes: PipeTransform<any>[]): this;

  /**
   * 注册全局拦截器(将用于每个模式处理程序)。
   *
   * @param {...NestInterceptor} interceptors
   */
  useGlobalInterceptors(...interceptors: NestInterceptor[]): this;

  /**
   * 注册全局守卫(将用于每个模式处理程序)。
   *
   * @param {...CanActivate} guards
   */
  useGlobalGuards(...guards: CanActivate[]): this;

  /**
   * 终止应用程序。
   *
   * @returns {Promise<void>}
   */
  close(): Promise<void>;

  /**
   * 返回一个发出状态变化的 Observable。
   *
   * @returns {Observable<string>}
   */
  status: Observable<string>;

  /**
   * 为给定事件注册事件监听器。
   * @param event 事件名称
   * @param callback 事件触发时要执行的回调
   */
  on<
    EventsMap extends Record<string, Function> = Record<string, Function>,
    EventKey extends keyof EventsMap = keyof EventsMap,
    EventCallback extends EventsMap[EventKey] = EventsMap[EventKey],
  >(
    event: EventKey,
    callback: EventCallback,
  ): void;

  /**
   * 返回底层服务器/代理实例，
   * 或者如果存在多个服务器，则返回一组服务器。
   */
  unwrap<T>(): T;
}
