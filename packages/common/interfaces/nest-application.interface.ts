import { CanActivate } from './features/can-activate.interface';
import { NestInterceptor } from './features/nest-interceptor.interface';
import { GlobalPrefixOptions } from './global-prefix-options.interface';
import { HttpServer } from './http/http-server.interface';
import {
  ExceptionFilter,
  INestMicroservice,
  NestHybridApplicationOptions,
  PipeTransform,
} from './index';
import { INestApplicationContext } from './nest-application-context.interface';
import { VersioningOptions } from './version-options.interface';
import { WebSocketAdapter } from './websockets/web-socket-adapter.interface';

/**
 * 定义核心 NestApplication 对象的接口。
 *
 * @publicApi
 */
export interface INestApplication<
  TServer = any,
> extends INestApplicationContext {
  /**
   * HTTP 适配器方法 `adapter.use()` 的包装函数。
   * 示例 `app.use(cors())`
   *
   * @returns {this}
   */
  use(...args: any[]): this;

  /**
   * 启用 CORS（跨域资源共享）
   *
   * @returns {void}
   */
  enableCors(options?: any): void;

  /**
   * 为应用程序启用版本控制。
   * 默认使用基于 URI 的版本控制。
   *
   * @param {VersioningOptions} options
   * @returns {this}
   */
  enableVersioning(options?: VersioningOptions): this;

  /**
   * 启动应用程序。
   *
   * @param {number|string} port
   * @param {string} [hostname]
   * @param {Function} [callback] 可选的回调函数
   * @returns {Promise} 一个 Promise，解析后是对底层 HttpServer 的引用。
   */
  listen(port: number | string, callback?: () => void): Promise<any>;
  listen(
    port: number | string,
    hostname: string,
    callback?: () => void,
  ): Promise<any>;

  /**
   * 返回应用程序正在监听的 URL，基于操作系统和 IP 版本。返回 IPv6 或 IPv4 格式的 IP 值
   *
   * @returns {Promise<string>} 服务器正在监听的 IP
   */
  getUrl(): Promise<string>;

  /**
   * 为每个 HTTP 路由路径注册前缀。
   *
   * @param {string} prefix 每个 HTTP 路由路径的前缀（例如 `/v1/api`）
   * @param {GlobalPrefixOptions} options 全局前缀选项对象
   * @returns {this}
   */
  setGlobalPrefix(prefix: string, options?: GlobalPrefixOptions): this;

  /**
   * 注册将在网关内部使用的 Ws 适配器。
   * 当你想覆盖默认的 `socket.io` 库时使用。
   *
   * @param {WebSocketAdapter} adapter
   * @returns {this}
   */
  useWebSocketAdapter(adapter: WebSocketAdapter): this;

  /**
   * 将微服务连接到 NestApplication 实例。将应用程序转换为混合实例。
   *
   * @template {object} T
   * @param {T} options 微服务选项对象
   * @param {NestHybridApplicationOptions} hybridOptions 混合选项对象
   * @returns {INestMicroservice}
   */
  connectMicroservice<T extends object = any>(
    options: T,
    hybridOptions?: NestHybridApplicationOptions,
  ): INestMicroservice;

  /**
   * 返回连接到 NestApplication 的微服务数组。
   *
   * @returns {INestMicroservice[]}
   */
  getMicroservices(): INestMicroservice[];

  /**
   * 返回底层原生 HTTP 服务器。
   *
   * @returns {TServer}
   */
  getHttpServer(): TServer;

  /**
   * 返回底层 HTTP 适配器。
   *
   * @returns {HttpServer}
   */
  getHttpAdapter(): HttpServer;

  /**
   * 异步启动所有连接的微服务。
   *
   * @returns {Promise}
   */
  startAllMicroservices(): Promise<this>;

  /**
   * 注册异常过滤器为全局过滤器（将在每个 HTTP 路由处理程序中使用）
   *
   * @param {...ExceptionFilter} filters
   */
  useGlobalFilters(...filters: ExceptionFilter[]): this;

  /**
   * 注册管道为全局管道（将在每个 HTTP 路由处理程序中使用）
   *
   * @param {...PipeTransform} pipes
   */
  useGlobalPipes(...pipes: PipeTransform<any>[]): this;

  /**
   * 注册拦截器为全局拦截器（将在每个 HTTP 路由处理程序中使用）
   *
   * @param {...NestInterceptor} interceptors
   */
  useGlobalInterceptors(...interceptors: NestInterceptor[]): this;

  /**
   * 注册守卫为全局守卫（将在每个 HTTP 路由处理程序中使用）
   *
   * @param {...CanActivate} guards
   */
  useGlobalGuards(...guards: CanActivate[]): this;

  /**
   * 终止应用程序（包括 NestApplication、网关和每个连接的微服务）
   *
   * @returns {Promise<void>}
   */
  close(): Promise<void>;
}
