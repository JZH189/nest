import {
  HttpStatus,
  InternalServerErrorException,
  Logger,
  RequestMethod,
  StreamableFile,
  VERSION_NEUTRAL,
  VersioningOptions,
  VersioningType,
} from '@nestjs/common';
import { VersionValue } from '@nestjs/common/interfaces';
import {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';
import {
  isFunction,
  isNil,
  isObject,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { AbstractHttpAdapter } from '@nestjs/core/adapters/http-adapter';
import { RouterMethodFactory } from '@nestjs/core/helpers/router-method-factory';
import { LegacyRouteConverter } from '@nestjs/core/router/legacy-route-converter';
import * as cors from 'cors';
import * as express from 'express';
import type { Server } from 'http';
import * as http from 'http';
import * as https from 'https';
import { pathToRegexp } from 'path-to-regexp';
import { Duplex, Writable } from 'stream';
import { NestExpressBodyParserOptions } from '../interfaces/nest-express-body-parser-options.interface';
import { NestExpressBodyParserType } from '../interfaces/nest-express-body-parser.interface';
import { ServeStaticOptions } from '../interfaces/serve-static-options.interface';
import { getBodyParserOptions } from './utils/get-body-parser-options.util';

/**
 * 带版本控制的路由处理函数签名：接收请求、响应以及 next 回调，
 * 由 applyVersionFilter 返回，用于在真正的路由处理函数前进行版本匹配过滤。
 */
type VersionedRoute = <
  TRequest extends Record<string, any> = any,
  TResponse = any,
>(
  req: TRequest,
  res: TResponse,
  next: () => void,
) => any;

/**
 * Express 平台的 HTTP 适配器，是 @nestjs/platform-express 的核心类。
 *
 * 当通过 `NestFactory.create(NestExpressApplication)` 创建应用时，
 * 该适配器负责把 NestJS 框架无关的抽象（AbstractHttpAdapter）落到
 * Express 的具体实现上：
 * - 持有 Express 实例（`this.instance`）以及底层的 http/https Server；
 * - 实现响应输出（reply/status/end）、重定向、模板渲染等通用接口；
 * - 实现静态资源托管、CORS、body 解析器注册、中间件工厂等 Express 特有能力；
 * - 实现各版本控制策略（URI/MEDIA_TYPE/HEADER/CUSTOM）的路由过滤逻辑。
 *
 * @publicApi
 */
export class ExpressAdapter extends AbstractHttpAdapter<
  http.Server | https.Server
> {
  /** 根据请求方法返回 Express 实例上对应路由注册方法（get/post/...）的工厂 */
  private readonly routerMethodFactory = new RouterMethodFactory();
  private readonly logger = new Logger(ExpressAdapter.name);
  /** 启用 forceCloseConnections 时跟踪所有打开的 TCP 连接，便于关闭时强制销毁 */
  private readonly openConnections = new Set<Duplex>();
  /** 可选的请求进入钩子（由 setOnRequestHook 设置），在每个请求处理前调用 */
  private onRequestHook?: (
    req: express.Request,
    res: express.Response,
    done: () => void,
  ) => Promise<void> | void;
  /** 可选的响应结束钩子（由 setOnResponseHook 设置），在响应 finish 后调用 */
  private onResponseHook?: (
    req: express.Request,
    res: express.Response,
  ) => Promise<void> | void;

  /**
   * 创建适配器实例。若未传入已有的 Express 实例，则内部新建一个 express() 应用，
   * 并注册一段顶层中间件，用于触发请求/响应生命周期钩子。
   *
   * @param instance - 可选的已有 Express 实例；不传时自动创建
   */
  constructor(instance?: any) {
    super(instance || express());
    this.instance!.use((req, res, next) => {
      // 1. 若注册了响应钩子，则在响应完成（finish 事件）后异步触发
      if (this.onResponseHook) {
        res.on('finish', () => {
          void this.onResponseHook!.apply(this, [req, res]);
        });
      }

      // 2. 若注册了请求钩子则调用它（由钩子自行决定是否调用 next），否则直接放行
      if (this.onRequestHook) {
        void this.onRequestHook.apply(this, [req, res, next]);
      } else {
        next();
      }
    });
  }

  /**
   * 注册请求进入钩子，在每个 HTTP 请求到达时被调用。
   *
   * @param onRequestHook - 钩子函数，参数为请求、响应与 next 回调
   */
  public setOnRequestHook(
    onRequestHook: (
      req: express.Request,
      res: express.Response,
      done: () => void,
    ) => Promise<void> | void,
  ) {
    this.onRequestHook = onRequestHook;
  }

  /**
   * 注册响应结束钩子，在响应流 finish 后被调用。
   *
   * @param onResponseHook - 钩子函数，参数为请求与响应对象
   */
  public setOnResponseHook(
    onResponseHook: (
      req: express.Request,
      res: express.Response,
    ) => Promise<void> | void,
  ) {
    this.onResponseHook = onResponseHook;
  }

  /**
   * 将路由处理结果写回 Express 响应对象。根据 body 类型选择不同的输出方式：
   * 流式文件用管道输出，对象用 json()，其余用 send()。
   *
   * @param response - Express 原生响应对象
   * @param body - 要写回的响应体（可为 StreamableFile、对象、字符串或空值）
   * @param statusCode - 可选的 HTTP 状态码
   * @returns Express 响应对象本身
   */
  public reply(response: any, body: any, statusCode?: number) {
    // 1. 若指定了状态码则先设置
    if (statusCode) {
      response.status(statusCode);
    }
    // 2. body 为空（null/undefined）时直接结束响应
    if (isNil(body)) {
      return response.send();
    }
    // 3. StreamableFile：设置流相关响应头，并将文件流通过管道写入响应
    if (body instanceof StreamableFile) {
      this.applyStreamHeaders(response, body);
      const stream = body.getStream();
      stream.once('error', err => {
        body.errorHandler(err, response);
      });
      return stream
        .pipe<Writable>(response)
        .on('error', (err: Error) => body.errorLogger(err));
    }
    // 4. 内容类型不是 JSON 且状态码为 4xx/5xx 时，警告可能缺少自定义异常过滤器，并强制改为 JSON
    const responseContentType = response.getHeader('Content-Type');
    if (
      typeof responseContentType === 'string' &&
      !responseContentType.startsWith('application/json') &&
      body?.statusCode >= HttpStatus.BAD_REQUEST
    ) {
      this.logger.warn(
        "Content-Type doesn't match Reply body, you might need a custom ExceptionFilter for non-JSON responses",
      );
      response.setHeader('Content-Type', 'application/json');
    }
    // 5. 对象走 response.json()，其他标量值转为字符串后 send()
    return isObject(body) ? response.json(body) : response.send(String(body));
  }

  /**
   * 设置响应的 HTTP 状态码。
   *
   * @param response - Express 原生响应对象
   * @param statusCode - HTTP 状态码
   */
  public status(response: any, statusCode: number) {
    return response.status(statusCode);
  }

  /**
   * 立即结束响应（可用于提前终止连接）。
   *
   * @param response - Express 原生响应对象
   * @param message - 可选的响应体内容
   */
  public end(response: any, message?: string) {
    return response.end(message);
  }

  /**
   * 渲染服务端模板视图（依赖已通过 setViewEngine 注册的模板引擎）。
   *
   * @param response - Express 原生响应对象
   * @param view - 视图名称
   * @param options - 传给模板引擎的渲染数据
   */
  public render(response: any, view: string, options: any) {
    return response.render(view, options);
  }

  /**
   * 执行 HTTP 重定向。
   *
   * @param response - Express 原生响应对象
   * @param statusCode - 重定向使用的状态码（如 301、302）
   * @param url - 目标地址
   */
  public redirect(response: any, statusCode: number, url: string) {
    return response.redirect(statusCode, url);
  }

  /**
   * 注册全局错误处理中间件。Express 中通过 use 注册，
   * Express 会根据处理函数的参数个数自动识别为错误处理器。
   *
   * @param handler - 错误处理函数
   * @param prefix - 可选的路径前缀（Express 实现中未使用）
   */
  public setErrorHandler(handler: Function, prefix?: string) {
    return this.use(handler);
  }

  /**
   * 注册 404（未匹配到任何路由）处理函数。Express 中同样通过 use 注册到末尾。
   *
   * @param handler - 未找到路由时的处理函数
   * @param prefix - 可选的路径前缀（Express 实现中未使用）
   */
  public setNotFoundHandler(handler: Function, prefix?: string) {
    return this.use(handler);
  }

  /**
   * 判断响应头是否已发送。
   *
   * @param response - Express 原生响应对象
   * @returns 响应头是否已经发出
   */
  public isHeadersSent(response: any): boolean {
    return response.headersSent;
  }

  /**
   * 读取响应头。
   *
   * @param response - Express 原生响应对象
   * @param name - 响应头名称
   * @returns 对应响应头的值
   */
  public getHeader(response: any, name: string) {
    return response.get(name);
  }

  /**
   * 设置响应头（覆盖已有值）。
   *
   * @param response - Express 原生响应对象
   * @param name - 响应头名称
   * @param value - 响应头值
   */
  public setHeader(response: any, name: string, value: string) {
    return response.set(name, value);
  }

  /**
   * 追加响应头值（用于 Set-Cookie 等可重复出现的响应头）。
   *
   * @param response - Express 原生响应对象
   * @param name - 响应头名称
   * @param value - 追加的响应头值
   */
  public appendHeader(response: any, name: string, value: string) {
    return response.append(name, value);
  }

  /**
   * 将 NestJS 风格的路由路径规范化为当前平台可用的路径。
   * 会先尝试把旧版路由语法（如 * 通配符）转换为新版语法，
   * 再用 pathToRegexp 校验路径合法性；非法路径会打印错误并抛出异常。
   *
   * @param path - 原始路由路径
   * @returns 转换并校验后的路由路径
   */
  public normalizePath(path: string): string {
    try {
      const convertedPath = LegacyRouteConverter.tryConvert(path);
      // Call "pathToRegexp" to trigger a TypeError if the path is invalid
      pathToRegexp(convertedPath);
      return convertedPath;
    } catch (e) {
      if (e instanceof TypeError) {
        LegacyRouteConverter.printError(path);
      }
      throw e;
    }
  }

  /**
   * 启动底层 HTTP(S) 服务器监听指定端口。
   *
   * @param port - 监听的端口号或 socket 路径
   * @param callback - 监听成功后的回调函数
   * @returns 底层 http/https Server 实例
   */
  public listen(port: string | number, callback?: () => void): Server;
  /**
   * 启动底层 HTTP(S) 服务器监听指定主机名与端口。
   *
   * @param port - 监听的端口号
   * @param hostname - 绑定的主机名
   * @param callback - 监听成功后的回调函数
   * @returns 底层 http/https Server 实例
   */
  public listen(
    port: string | number,
    hostname: string,
    callback?: () => void,
  ): Server;
  public listen(port: any, ...args: any[]): Server {
    return this.httpServer.listen(port, ...args);
  }

  /**
   * 关闭底层 HTTP 服务器。若启用了 forceCloseConnections，
   * 会先强制销毁所有仍打开的 TCP 连接，再等待服务器关闭完成。
   *
   * @returns 服务器关闭完成后 resolve 的 Promise（无服务器时返回 undefined）
   */
  public close() {
    this.closeOpenConnections();

    if (!this.httpServer) {
      return undefined;
    }
    return new Promise(resolve => this.httpServer.close(resolve));
  }

  /**
   * 透传 Express 的 app.set() 调用，用于设置应用级配置项。
   *
   * @param args - 透传给 Express 的参数（键值对）
   */
  public set(...args: any[]) {
    return this.instance.set(...args);
  }

  /**
   * 透传 Express 的 app.enable()，开启某个布尔型设置（如 'x-powered-by'）。
   *
   * @param args - 透传给 Express 的参数
   */
  public enable(...args: any[]) {
    return this.instance.enable(...args);
  }

  /**
   * 透传 Express 的 app.disable()，关闭某个布尔型设置。
   *
   * @param args - 透传给 Express 的参数
   */
  public disable(...args: any[]) {
    return this.instance.disable(...args);
  }

  /**
   * 透传 Express 的 app.engine()，注册自定义模板引擎。
   *
   * @param args - 透传给 Express 的参数（扩展名、引擎函数等）
   */
  public engine(...args: any[]) {
    return this.instance.engine(...args);
  }

  /**
   * 托管静态资源，底层使用 express.static 中间件。
   *
   * @param path - 静态资源所在目录
   * @param options - 静态资源服务配置（含可选的 URL 前缀 prefix）
   */
  public useStaticAssets(path: string, options: ServeStaticOptions) {
    // 1. 若指定了 URL 前缀，则将该前缀与静态资源中间件绑定
    if (options && options.prefix) {
      return this.use(options.prefix, express.static(path, options));
    }
    // 2. 否则直接注册到应用根路径
    return this.use(express.static(path, options));
  }

  /**
   * 设置服务端渲染视图文件所在目录，对应 Express 的 'views' 设置。
   *
   * @param path - 视图目录（可为目录数组）
   */
  public setBaseViewsDir(path: string | string[]) {
    return this.set('views', path);
  }

  /**
   * 设置服务端渲染使用的模板引擎，对应 Express 的 'view engine' 设置。
   *
   * @param engine - 模板引擎名称（如 'pug'、'ejs'）
   */
  public setViewEngine(engine: string) {
    return this.set('view engine', engine);
  }

  /**
   * 从请求对象中获取主机名。
   *
   * @param request - Express 原生请求对象
   * @returns 请求的主机名
   */
  public getRequestHostname(request: any): string {
    return request.hostname;
  }

  /**
   * 从请求对象中获取 HTTP 方法。
   *
   * @param request - Express 原生请求对象
   * @returns 请求方法（GET/POST 等）
   */
  public getRequestMethod(request: any): string {
    return request.method;
  }

  /**
   * 从请求对象中获取原始 URL（含挂载前缀）。
   *
   * @param request - Express 原生请求对象
   * @returns 原始请求 URL
   */
  public getRequestUrl(request: any): string {
    return request.originalUrl;
  }

  /**
   * 启用 CORS 跨域支持，底层注册 cors 中间件。
   *
   * @param options - CORS 配置对象或按请求返回配置的委托函数
   */
  public enableCors(options: CorsOptions | CorsOptionsDelegate<any>) {
    return this.use(cors(options as any));
  }

  /**
   * 创建按 HTTP 方法注册路由中间件的工厂函数。
   * 返回的函数会把（转换后的）路径与回调绑定到 Express 实例上，
   * 注册失败时打印旧版路由语法错误并抛出异常。
   *
   * @param requestMethod - 请求方法（GET/POST 等）
   * @returns 一个 (path, callback) => any 形式的路由注册函数
   */
  public createMiddlewareFactory(
    requestMethod: RequestMethod,
  ): (path: string, callback: Function) => any {
    return (path: string, callback: Function) => {
      try {
        // 1. 先尝试把旧版路由语法转换为新版语法
        const convertedPath = LegacyRouteConverter.tryConvert(path);
        // 2. 从工厂中取出对应方法的注册函数（如 instance.post）并完成注册
        return this.routerMethodFactory
          .get(this.instance, requestMethod)
          .call(this.instance, convertedPath, callback);
      } catch (e) {
        // 3. 路径非法（TypeError）时打印旧版语法错误提示后原样抛出
        if (e instanceof TypeError) {
          LegacyRouteConverter.printError(path);
        }
        throw e;
      }
    };
  }

  /**
   * 初始化底层 HTTP(S) 服务器：根据是否传入 httpsOptions 决定创建
   * https 还是 http 服务器，并把 Express 实例作为请求处理器。
   *
   * @param options - 应用创建选项（可包含 httpsOptions、forceCloseConnections）
   */
  public initHttpServer(options: NestApplicationOptions) {
    // 1. 若配置了 httpsOptions 则创建 HTTPS 服务器，否则创建 HTTP 服务器
    const isHttpsEnabled = options && options.httpsOptions;
    if (isHttpsEnabled) {
      this.httpServer = https.createServer(
        options.httpsOptions!,
        this.getInstance(),
      );
    } else {
      this.httpServer = http.createServer(this.getInstance());
    }

    // 2. 若要求强制关闭连接，则开始跟踪所有打开的 socket
    if (options?.forceCloseConnections) {
      this.trackOpenConnections();
    }
  }

  /**
   * 注册默认的 JSON 与 urlencoded body 解析中间件。
   * 通过 getBodyParserOptions 计算选项（rawBody 时会额外暴露原始请求体），
   * 并借助 isMiddlewareApplied 防止重复注册。
   *
   * @param prefix - 挂载前缀（未使用，仅保持接口一致）
   * @param rawBody - 是否需要在请求对象上暴露原始 body（Buffer）
   */
  public registerParserMiddleware(prefix?: string, rawBody?: boolean) {
    // 1. 分别计算 json 与 urlencoded 解析器的选项（urlencoded 使用 extended 模式）
    const bodyParserJsonOptions = getBodyParserOptions(rawBody!);
    const bodyParserUrlencodedOptions = getBodyParserOptions(rawBody!, {
      extended: true,
    });

    // 2. 构建两种解析中间件
    const parserMiddleware = {
      jsonParser: express.json(bodyParserJsonOptions),
      urlencodedParser: express.urlencoded(bodyParserUrlencodedOptions),
    };
    // 3. 过滤掉已经注册过的解析器，避免重复挂载
    Object.keys(parserMiddleware)
      .filter(parser => !this.isMiddlewareApplied(parser))
      .forEach(parserKey => this.use(parserMiddleware[parserKey]));
  }

  /**
   * 注册任意类型的 Express body 解析中间件（如 text、raw 等）。
   *
   * @param type - 解析器类型（json/urlencoded/text/raw）
   * @param rawBody - 是否需要在请求对象上暴露原始 body
   * @param options - 解析器选项（可省略 verify 字段，由内部统一注入）
   * @returns 适配器自身（支持链式调用）
   */
  public useBodyParser<
    Options extends NestExpressBodyParserOptions = NestExpressBodyParserOptions,
  >(
    type: NestExpressBodyParserType,
    rawBody: boolean,
    options?: Omit<Options, 'verify'>,
  ): this {
    // 1. 根据类型与选项构造解析器实例并挂载到应用上
    const parserOptions = getBodyParserOptions<Options>(rawBody, options);
    const parser = express[type](parserOptions);

    this.use(parser);

    return this;
  }

  /**
   * 设置模板渲染时可用的局部变量（对应 Express 的 app.locals）。
   *
   * @param key - 变量名
   * @param value - 变量值
   * @returns 适配器自身（支持链式调用）
   */
  public setLocal(key: string, value: any) {
    this.instance.locals[key] = value;
    return this;
  }

  /**
   * 返回适配器类型标识。
   *
   * @returns 固定为 'express'
   */
  public getType(): string {
    return 'express';
  }

  /**
   * 根据版本控制策略对路由处理函数进行包装，返回一个先做版本匹配、
   * 匹配成功才调用真实处理函数（否则调用 next 交给下一个处理器）的过滤函数。
   * 支持 VERSION_NEUTRAL、URI、CUSTOM、MEDIA_TYPE、HEADER 五种情形。
   *
   * @param handler - 原始路由处理函数
   * @param version - 路由声明的版本（字符串、版本数组或 VERSION_NEUTRAL）
   * @param versioningOptions - 全局版本控制配置（类型、自定义提取器、header 名等）
   * @returns 包装后的版本过滤路由函数
   */
  public applyVersionFilter(
    handler: Function,
    version: VersionValue,
    versioningOptions: VersioningOptions,
  ): VersionedRoute {
    // 1. 兜底处理函数：版本不匹配时交给下一个处理器；无 next 则抛出服务器错误
    const callNextHandler: VersionedRoute = (req, res, next) => {
      if (!next) {
        throw new InternalServerErrorException(
          'HTTP adapter does not support filtering on version',
        );
      }
      return next();
    };

    // 2. 中性版本或 URI 版本控制（版本已编入 URL 路径）时，无需过滤，直接透传
    if (
      version === VERSION_NEUTRAL ||
      // URL Versioning is done via the path, so the filter continues forward
      versioningOptions.type === VersioningType.URI
    ) {
      const handlerForNoVersioning: VersionedRoute = (req, res, next) =>
        handler(req, res, next);

      return handlerForNoVersioning;
    }

    // 3. 自定义提取器版本控制：用 extractor 从请求中提取版本后与声明版本比对
    if (versioningOptions.type === VersioningType.CUSTOM) {
      const handlerForCustomVersioning: VersionedRoute = (req, res, next) => {
        const extractedVersion = versioningOptions.extractor(req);

        if (Array.isArray(version)) {
          // 3.1 声明版本为数组：提取出的版本（数组或字符串）与其有交集即匹配
          if (
            Array.isArray(extractedVersion) &&
            version.filter(v => extractedVersion.includes(v as string)).length
          ) {
            return handler(req, res, next);
          }

          if (
            isString(extractedVersion) &&
            version.includes(extractedVersion)
          ) {
            return handler(req, res, next);
          }
        } else if (isString(version)) {
          // Known bug here - if there are multiple versions supported across separate
          // handlers/controllers, we can't select the highest matching handler.
          // Since this code is evaluated per-handler, then we can't see if the highest
          // specified version exists in a different handler.
          if (
            Array.isArray(extractedVersion) &&
            extractedVersion.includes(version)
          ) {
            return handler(req, res, next);
          }

          if (isString(extractedVersion) && version === extractedVersion) {
            return handler(req, res, next);
          }
        }

        // 3.2 都不匹配则调用下一个处理器
        return callNextHandler(req, res, next);
      };

      return handlerForCustomVersioning;
    }

    // 4. 媒体类型（Accept 头）版本控制：解析 Accept 头中分号后的版本参数进行比对
    if (versioningOptions.type === VersioningType.MEDIA_TYPE) {
      const handlerForMediaTypeVersioning: VersionedRoute = (
        req,
        res,
        next,
      ) => {
        const MEDIA_TYPE_HEADER = 'Accept';
        const acceptHeaderValue: string | undefined =
          req.headers?.[MEDIA_TYPE_HEADER] ||
          req.headers?.[MEDIA_TYPE_HEADER.toLowerCase()];

        const acceptHeaderVersionParameter = acceptHeaderValue
          ? acceptHeaderValue.split(';')[1]
          : undefined;

        // No version was supplied
        if (isUndefined(acceptHeaderVersionParameter)) {
          // 4.1 请求未携带版本：仅当声明版本包含 VERSION_NEUTRAL 时才匹配
          if (Array.isArray(version)) {
            if (version.includes(VERSION_NEUTRAL)) {
              return handler(req, res, next);
            }
          }
        } else {
          // 4.2 按 versioningOptions.key 分隔出版本号并与声明版本比对
          const headerVersion = acceptHeaderVersionParameter.split(
            versioningOptions.key,
          )[1];

          if (Array.isArray(version)) {
            if (version.includes(headerVersion)) {
              return handler(req, res, next);
            }
          } else if (isString(version)) {
            if (version === headerVersion) {
              return handler(req, res, next);
            }
          }
        }

        return callNextHandler(req, res, next);
      };

      return handlerForMediaTypeVersioning;
    }

    // 5. 自定义 Header 版本控制：从指定请求头读取版本号进行比对
    if (versioningOptions.type === VersioningType.HEADER) {
      const handlerForHeaderVersioning: VersionedRoute = (req, res, next) => {
        const customHeaderVersionParameter: string | undefined =
          req.headers?.[versioningOptions.header] ||
          req.headers?.[versioningOptions.header.toLowerCase()];

        // No version was supplied
        if (isUndefined(customHeaderVersionParameter)) {
          // 5.1 请求未携带版本头：仅当声明版本包含 VERSION_NEUTRAL 时才匹配
          if (Array.isArray(version)) {
            if (version.includes(VERSION_NEUTRAL)) {
              return handler(req, res, next);
            }
          }
        } else {
          // 5.2 与声明版本（数组或字符串）比对
          if (Array.isArray(version)) {
            if (version.includes(customHeaderVersionParameter)) {
              return handler(req, res, next);
            }
          } else if (isString(version)) {
            if (version === customHeaderVersionParameter) {
              return handler(req, res, next);
            }
          }
        }

        return callNextHandler(req, res, next);
      };

      return handlerForHeaderVersioning;
    }

    throw new Error('Unsupported versioning options');
  }

  /**
   * 监听底层服务器的 connection 事件，把每个新连接加入 openConnections
   * 集合，并在连接关闭时移除，用于支持 forceCloseConnections。
   */
  private trackOpenConnections() {
    this.httpServer.on('connection', (socket: Duplex) => {
      this.openConnections.add(socket);

      socket.on('close', () => this.openConnections.delete(socket));
    });
  }

  /**
   * 强制销毁所有仍打开的 TCP 连接（用于应用关闭时立即断开活跃连接）。
   */
  private closeOpenConnections() {
    for (const socket of this.openConnections) {
      socket.destroy();
      this.openConnections.delete(socket);
    }
  }

  /**
   * 检查某个具名中间件是否已挂载到 Express 路由栈上（通过函数名比对）。
   *
   * @param name - 中间件函数名
   * @returns 是否已挂载
   */
  private isMiddlewareApplied(name: string): boolean {
    const app = this.getInstance();
    return (
      !!app.router &&
      !!app.router.stack &&
      isFunction(app.router.stack.filter) &&
      app.router.stack.some(
        (layer: any) => layer && layer.handle && layer.handle.name === name,
      )
    );
  }

  /**
   * 仅当响应头尚未设置时才写入该响应头（避免覆盖用户自定义值）。
   *
   * @param response - Express 原生响应对象
   * @param name - 响应头名称
   * @param value - 响应头值（数组会以逗号拼接）
   */
  private setHeaderIfNotExists(
    response: any,
    name: string,
    value?: string | string[] | number,
  ) {
    if (value !== undefined && response.getHeader(name) === undefined) {
      const headerValue = Array.isArray(value) ? value.join(',') : value;
      response.setHeader(name, headerValue);
    }
  }

  /**
   * 为 StreamableFile 流式响应补充 Content-Type、Content-Disposition、
   * Content-Length 三个响应头（仅在用户未自行设置时写入）。
   *
   * @param response - Express 原生响应对象
   * @param streamable - 流式文件对象
   */
  private applyStreamHeaders(response: any, streamable: StreamableFile) {
    const headers = streamable.getHeaders();

    this.setHeaderIfNotExists(response, 'Content-Type', headers.type);
    this.setHeaderIfNotExists(
      response,
      'Content-Disposition',
      headers.disposition,
    );
    this.setHeaderIfNotExists(response, 'Content-Length', headers.length);
  }
}
