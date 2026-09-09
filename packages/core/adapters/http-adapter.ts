import { HttpServer, RequestMethod, VersioningOptions } from '@nestjs/common';
import { RequestHandler, VersionValue } from '@nestjs/common/interfaces';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';

/**
 * HTTP 适配器抽象基类：Nest 与底层 HTTP 平台（Express/Fastify 等）之间的桥梁。
 *
 * 职责：
 * - 定义所有平台必须实现的抽象接口：请求/响应操作（status/reply/redirect）、
 *   静态资源、视图引擎、CORS、解析中间件、错误与 404 处理器、版本过滤等；
 * - 已在基类中实现的方法（HTTP 动词注册、listen、use 等）直接转发给
 *   底层平台实例（this.instance），因为这些 API 在各平台间语义基本一致；
 * - 具体平台（如 ExpressAdapter）继承本类并实现全部抽象方法。
 *
 * NestFactory 默认通过 loadAdapter 加载 @nestjs/platform-express，
 * 用户也可传入自定义适配器（继承本类）替换默认平台。
 *
 * @typeParam TServer - 底层 HTTP 服务器类型（如 http.Server）
 * @typeParam TRequest - 请求对象类型
 * @typeParam TResponse - 响应对象类型
 *
 * @publicApi
 */
export abstract class AbstractHttpAdapter<
  TServer = any,
  TRequest = any,
  TResponse = any,
> implements HttpServer<TRequest, TResponse> {
  /** 底层 HTTP 服务器实例（由 initHttpServer 创建） */
  protected httpServer: TServer;
  /** 路由触发回调（可选，用于监控路由注册/触发事件） */
  protected onRouteTriggered:
    | ((requestMethod: RequestMethod, path: string) => void)
    | undefined;

  /**
   * @param instance - 底层平台实例（如 Express 的 app 对象）
   */
  constructor(protected instance?: any) {}

  /**
   * 适配器初始化钩子（子类可覆写以执行平台相关的初始化逻辑）。
   */
  public async init() {}

  /**
   * 注册中间件（等价于 Express 的 app.use）。
   *
   * @param args - 中间件函数或路径 + 中间件函数
   * @returns 底层平台实例的返回值
   */
  public use(...args: any[]) {
    return this.instance.use(...args);
  }

  /**
   * 注册 GET 请求处理器（第一个参数为路径或直接为处理器）。
   *
   * @param path - 可选的路由路径
   * @param handler - 请求处理器
   * @returns 底层平台实例的返回值
   */
  public get(handler: RequestHandler);
  public get(path: any, handler: RequestHandler);
  public get(...args: any[]) {
    return this.instance.get(...args);
  }

  /**
   * 注册 POST 请求处理器。
   *
   * @param path - 可选的路由路径
   * @param handler - 请求处理器
   */
  public post(handler: RequestHandler);
  public post(path: any, handler: RequestHandler);
  public post(...args: any[]) {
    return this.instance.post(...args);
  }

  /** 注册 HEAD 请求处理器。 */
  public head(handler: RequestHandler);
  public head(path: any, handler: RequestHandler);
  public head(...args: any[]) {
    return this.instance.head(...args);
  }

  /** 注册 DELETE 请求处理器。 */
  public delete(handler: RequestHandler);
  public delete(path: any, handler: RequestHandler);
  public delete(...args: any[]) {
    return this.instance.delete(...args);
  }

  /** 注册 PUT 请求处理器。 */
  public put(handler: RequestHandler);
  public put(path: any, handler: RequestHandler);
  public put(...args: any[]) {
    return this.instance.put(...args);
  }

  /** 注册 PATCH 请求处理器。 */
  public patch(handler: RequestHandler);
  public patch(path: any, handler: RequestHandler);
  public patch(...args: any[]) {
    return this.instance.patch(...args);
  }

  /** 注册 WebDAV PROPFIND 请求处理器。 */
  public propfind(handler: RequestHandler);
  public propfind(path: any, handler: RequestHandler);
  public propfind(...args: any[]) {
    return this.instance.propfind(...args);
  }

  /** 注册 WebDAV PROPPATCH 请求处理器。 */
  public proppatch(handler: RequestHandler);
  public proppatch(path: any, handler: RequestHandler);
  public proppatch(...args: any[]) {
    return this.instance.proppatch(...args);
  }

  /** 注册 WebDAV MKCOL 请求处理器。 */
  public mkcol(handler: RequestHandler);
  public mkcol(path: any, handler: RequestHandler);
  public mkcol(...args: any[]) {
    return this.instance.mkcol(...args);
  }

  /** 注册 WebDAV COPY 请求处理器。 */
  public copy(handler: RequestHandler);
  public copy(path: any, handler: RequestHandler);
  public copy(...args: any[]) {
    return this.instance.copy(...args);
  }

  /** 注册 WebDAV MOVE 请求处理器。 */
  public move(handler: RequestHandler);
  public move(path: any, handler: RequestHandler);
  public move(...args: any[]) {
    return this.instance.move(...args);
  }

  /** 注册 WebDAV LOCK 请求处理器。 */
  public lock(handler: RequestHandler);
  public lock(path: any, handler: RequestHandler);
  public lock(...args: any[]) {
    return this.instance.lock(...args);
  }

  /** 注册 WebDAV UNLOCK 请求处理器。 */
  public unlock(handler: RequestHandler);
  public unlock(path: any, handler: RequestHandler);
  public unlock(...args: any[]) {
    return this.instance.unlock(...args);
  }

  /** 注册匹配所有 HTTP 方法的请求处理器。 */
  public all(handler: RequestHandler);
  public all(path: any, handler: RequestHandler);
  public all(...args: any[]) {
    return this.instance.all(...args);
  }

  /** 注册 SEARCH 请求处理器。 */
  public search(handler: RequestHandler);
  public search(path: any, handler: RequestHandler);
  public search(...args: any[]) {
    return this.instance.search(...args);
  }

  /** 注册 OPTIONS 请求处理器。 */
  public options(handler: RequestHandler);
  public options(path: any, handler: RequestHandler);
  public options(...args: any[]) {
    return this.instance.options(...args);
  }

  /**
   * 监听指定端口（可选指定主机名），启动底层 HTTP 服务器。
   *
   * @param port - 监听端口
   * @param hostname - 可选的主机名
   * @param callback - 监听成功后的回调
   */
  public listen(port: string | number, callback?: () => void);
  public listen(port: string | number, hostname: string, callback?: () => void);
  public listen(port: any, hostname?: any, callback?: any) {
    return this.instance.listen(port, hostname, callback);
  }

  /**
   * 获取底层 HTTP 服务器实例。
   *
   * @returns 原生 HTTP 服务器（如 http.Server）
   */
  public getHttpServer(): TServer {
    return this.httpServer;
  }

  /**
   * 替换底层 HTTP 服务器实例。
   *
   * @param httpServer - 新的服务器实例
   */
  public setHttpServer(httpServer: TServer) {
    this.httpServer = httpServer;
  }

  /**
   * 替换底层平台实例（如 Express app 对象）。
   *
   * @param instance - 新的平台实例
   */
  public setInstance<T = any>(instance: T) {
    this.instance = instance;
  }

  /**
   * 获取底层平台实例。
   *
   * @returns 平台实例（如 Express app）
   */
  public getInstance<T = any>(): T {
    return this.instance as T;
  }

  /**
   * 规范化路由路径（默认原样返回；Fastify 等平台会覆写以适配其通配符语法）。
   *
   * @param path - 原始路径
   * @returns 规范化后的路径
   */
  public normalizePath(path: string): string {
    return path;
  }

  /**
   * 注册路由触发回调（用于监控路由事件）。
   *
   * @param onRouteTriggered - 回调函数，参数为请求方法与路径
   */
  public setOnRouteTriggered(
    onRouteTriggered: (requestMethod: RequestMethod, path: string) => void,
  ) {
    this.onRouteTriggered = onRouteTriggered;
  }

  /**
   * 获取路由触发回调。
   *
   * @returns 当前注册的回调函数
   */
  public getOnRouteTriggered() {
    return this.onRouteTriggered;
  }

  /**
   * 注册请求钩子（仅部分平台支持，如 Fastify 的 onRequest 钩子）。
   *
   * @param onRequestHook - 请求钩子函数
   */
  public setOnRequestHook(onRequestHook: Function): void {}

  /**
   * 注册响应钩子（仅部分平台支持）。
   *
   * @param onResponseHook - 响应钩子函数
   */
  public setOnResponseHook(onResponseHook: Function): void {}

  /** 关闭底层 HTTP 服务器。 */
  abstract close();
  /** 创建底层 HTTP 服务器实例。 */
  abstract initHttpServer(options: NestApplicationOptions);
  /** 配置静态资源服务。 */
  abstract useStaticAssets(...args: any[]);
  /** 设置服务端视图引擎。 */
  abstract setViewEngine(engine: string);
  /** 从请求对象中提取主机名。 */
  abstract getRequestHostname(request: any);
  /** 从请求对象中提取 HTTP 方法（大写）。 */
  abstract getRequestMethod(request: any);
  /** 从请求对象中提取请求 URL（含查询串）。 */
  abstract getRequestUrl(request: any);
  /** 设置响应的状态码。 */
  abstract status(response: any, statusCode: number);
  /** 向响应写入响应体（可指定状态码）。 */
  abstract reply(response: any, body: any, statusCode?: number);
  /** 结束响应（可附带原因短语）。 */
  abstract end(response: any, message?: string);
  /** 渲染服务端视图。 */
  abstract render(response: any, view: string, options: any);
  /** 执行重定向。 */
  abstract redirect(response: any, statusCode: number, url: string);
  /** 注册全局错误处理器。 */
  abstract setErrorHandler(handler: Function, prefix?: string);
  /** 注册 404 Not Found 处理器。 */
  abstract setNotFoundHandler(handler: Function, prefix?: string);
  /** 判断响应头是否已发送。 */
  abstract isHeadersSent(response: any);
  /** 读取响应头的值。 */
  abstract getHeader(response: any, name: string);
  /** 设置响应头。 */
  abstract setHeader(response: any, name: string, value: string);
  /** 追加响应头（允许同名多值）。 */
  abstract appendHeader(response: any, name: string, value: string);
  /** 注册解析中间件（body-parser 等）。 */
  abstract registerParserMiddleware(prefix?: string, rawBody?: boolean);
  /** 启用 CORS 跨域支持。 */
  abstract enableCors(options?: any, prefix?: string);
  /**
   * 创建中间件工厂：返回可将 (path, callback) 绑定为
   * 指定 HTTP 方法中间件的函数。
   */
  abstract createMiddlewareFactory(
    requestMethod: RequestMethod,
  ):
    | ((path: string, callback: Function) => any)
    | Promise<(path: string, callback: Function) => any>;
  /** 返回适配器类型标识（如 'express'/'fastify'）。 */
  abstract getType(): string;
  /**
   * 对处理器应用版本过滤：根据请求的版本信息决定是否放行，
   * 返回包装后的处理器。
   */
  abstract applyVersionFilter(
    handler: Function,
    version: VersionValue,
    versioningOptions: VersioningOptions,
  ): (req: TRequest, res: TResponse, next: () => void) => Function;
}
