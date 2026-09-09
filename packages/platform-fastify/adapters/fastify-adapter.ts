/* eslint-disable @typescript-eslint/no-floating-promises */
import { FastifyCorsOptions } from '@fastify/cors';
import {
  HttpStatus,
  Logger,
  RawBodyRequest,
  RequestMethod,
  StreamableFile,
  VERSION_NEUTRAL,
  VersioningOptions,
  VersioningType,
} from '@nestjs/common';
import { VersionValue } from '@nestjs/common/interfaces';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isString, isUndefined } from '@nestjs/common/utils/shared.utils';
import { AbstractHttpAdapter } from '@nestjs/core/adapters/http-adapter';
import { LegacyRouteConverter } from '@nestjs/core/router/legacy-route-converter';
import {
  FastifyBaseLogger,
  FastifyBodyParser,
  FastifyInstance,
  FastifyListenOptions,
  FastifyPluginAsync,
  FastifyPluginCallback,
  FastifyRegister,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
  HTTPMethods,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
  RequestGenericInterface,
  RouteGenericInterface,
  RouteOptions,
  RouteShorthandOptions,
  fastify,
} from 'fastify';
import * as Reply from 'fastify/lib/reply';
import { kRouteContext } from 'fastify/lib/symbols';
import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import {
  InjectOptions,
  Chain as LightMyRequestChain,
  Response as LightMyRequestResponse,
} from 'light-my-request';
import { pathToRegexp } from 'path-to-regexp';
// Fastify uses `fast-querystring` internally to quickly parse URL query strings.
import { parse as querystringParse } from 'fast-querystring';
import { safeDecodeURI } from 'find-my-way/lib/url-sanitizer';
import {
  FASTIFY_ROUTE_CONFIG_METADATA,
  FASTIFY_ROUTE_CONSTRAINTS_METADATA,
  FASTIFY_ROUTE_SCHEMA_METADATA,
} from '../constants';
import { NestFastifyBodyParserOptions } from '../interfaces';
import {
  FastifyStaticOptions,
  FastifyViewOptions,
} from '../interfaces/external';
import middie from './middie/fastify-middie';

/**
 * FastifyAdapter 的基础选项：继承 FastifyServerOptions，
 * 并额外提供 NestJS 专属的 skipMiddie 开关——设为 true 时跳过
 * 内部注册的 middie（@fastify/middie 克隆版）插件，从而不启用
 * Express 风格的中间件（app.use）支持。
 */
type FastifyAdapterBaseOptions<
  Server extends RawServerBase = RawServerDefault,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
> = FastifyServerOptions<Server, Logger> & {
  skipMiddie?: boolean;
};

/** 启用 HTTP2 + HTTPS（SecureSession）时的适配器选项：http2 必须为 true，并传入 https 配置。 */
type FastifyHttp2SecureOptions<
  Server extends http2.Http2SecureServer,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
> = FastifyAdapterBaseOptions<Server, Logger> & {
  http2: true;
  https: http2.SecureServerOptions;
};

/** 启用 HTTP2（明文）时的适配器选项：http2 必须为 true，可选会话超时时间。 */
type FastifyHttp2Options<
  Server extends http2.Http2Server,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
> = FastifyAdapterBaseOptions<Server, Logger> & {
  http2: true;
  http2SessionTimeout?: number;
};

/** 启用 HTTPS（HTTP1.1）时的适配器选项：传入 https 服务器配置。 */
type FastifyHttpsOptions<
  Server extends https.Server,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
> = FastifyAdapterBaseOptions<Server, Logger> & {
  https: https.ServerOptions;
};

/** 启用 HTTP（HTTP1.1）时的适配器选项：传入 http 服务器配置。 */
type FastifyHttpOptions<
  Server extends http.Server,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
> = FastifyAdapterBaseOptions<Server, Logger> & {
  http: http.ServerOptions;
};

/**
 * 带版本信息的路由处理函数类型。与 Express 适配器不同，Fastify 通过
 * find-my-way 的"约束"（constraints）机制在路由匹配阶段完成版本筛选，
 * 因此这里只是把 version / versioningOptions 附加到处理函数引用上，
 * 由 injectRouteOptions 注册路由时读取并转成路由约束。
 */
type VersionedRoute<TRequest, TResponse> = ((
  req: TRequest,
  res: TResponse,
  next: Function,
) => Function) & {
  version: VersionValue;
  versioningOptions: VersioningOptions;
};

/**
 * 前提条件：适配器强制注册了 middie 插件，它会给 Fastify 的原始请求
 * （RawRequest）补上 originalUrl 属性，因此这里在原生请求类型上
 * 追加可选的 originalUrl 字段。
 * ref https://github.com/fastify/middie/pull/16
 * ref https://github.com/fastify/fastify/pull/559
 */
type FastifyRawRequest<TServer extends RawServerBase> =
  RawRequestDefaultExpression<TServer> & { originalUrl?: string };

/**
 * Fastify 平台的 HTTP 适配器，是 @nestjs/platform-fastify 的核心类（@publicApi）。
 *
 * 当通过 `NestFactory.create(NestFastifyApplication, new FastifyAdapter())`
 * 创建应用时，该适配器把 NestJS 框架无关的抽象（AbstractHttpAdapter）落到
 * Fastify 的具体实现上。与 ExpressAdapter 的主要差异：
 * - 路由注册：Express 用 app.get(path, handler) 逐条注册；Fastify 则把路由
 *   描述（method/url/handler/constraints/schema/config）通过 instance.route()
 *   一次性注入，且借助 find-my-way 的"约束"机制在路由匹配阶段实现版本控制
 *   （见 versionConstraint / applyVersionFilter），而不是像 Express 那样包装
 *   处理函数在运行期过滤；
 * - 中间件：Fastify 原生不支持 Express 风格中间件，适配器内部注册了
 *   @fastify/middie 的克隆版（adapters/middie/fastify-middie.ts）以提供
 *   app.use() 能力（可用 skipMiddie 关闭）；
 * - 请求/响应包装：FastifyReply 是轻量门面而非流，适配器在 reply() 等方法中
 *   会在必要时手动构造 Reply 实例，最终写响应依赖 reply.send()；
 * - body 解析：通过 addContentTypeParser 注册 JSON / urlencoded 解析器，
 *   并支持 rawBody 与自定义解析器；
 * - 静态资源与视图引擎分别通过按需加载的 @fastify/static 与 @fastify/view
 *   插件实现。
 *
 * @publicApi
 */
export class FastifyAdapter<
  TServer extends RawServerBase = RawServerDefault,
  TRawRequest extends FastifyRawRequest<TServer> = FastifyRawRequest<TServer>,
  TRawResponse extends RawReplyDefaultExpression<TServer> =
    RawReplyDefaultExpression<TServer>,
  TRequest extends FastifyRequest<
    RequestGenericInterface,
    TServer,
    TRawRequest
  > = FastifyRequest<RequestGenericInterface, TServer, TRawRequest>,
  TReply extends FastifyReply<
    RouteGenericInterface,
    TServer,
    TRawRequest,
    TRawResponse
  > = FastifyReply<RouteGenericInterface, TServer, TRawRequest, TRawResponse>,
  TInstance extends FastifyInstance<TServer, TRawRequest, TRawResponse> =
    FastifyInstance<TServer, TRawRequest, TRawResponse>,
> extends AbstractHttpAdapter<TServer, TRequest, TReply> {
  protected readonly logger = new Logger(FastifyAdapter.name);
  /** 底层 Fastify 实例（区别于 Express：适配器内部默认通过 fastify() 创建） */
  protected readonly instance: TInstance;
  /** 全局路由前缀（由 registerParserMiddleware 记录），注册路由时自动拼接到路径前 */
  protected _pathPrefix?: string;

  /** 是否已注册默认的内容解析器（JSON / urlencoded），防止重复注册 */
  private _isParserRegistered: boolean;
  /** 请求进入钩子（由 setOnRequestHook 设置），在 Fastify onRequest 钩子中触发 */
  private onRequestHook?: (
    request: TRequest,
    reply: TReply,
    done: (err?: Error) => void,
  ) => void | Promise<void>;
  /** 响应结束钩子（由 setOnResponseHook 设置），在 Fastify onResponse 钩子中触发 */
  private onResponseHook?: (
    request: TRequest,
    reply: TReply,
    done: (err?: Error) => void,
  ) => void | Promise<void>;
  /** 是否已注册 middie 插件（Fastify 借此支持 Express 风格中间件） */
  private isMiddieRegistered: boolean;
  /** middie 未注册前通过 use() 提交的中间件，待 init() 注册 middie 后再补挂 */
  private pendingMiddlewares: Array<{ args: any[] }> = [];
  /** 全局版本控制配置（首次 applyVersionFilter 时缓存，供约束提取器使用） */
  private versioningOptions?: VersioningOptions;
  /**
   * Fastify 路由"版本约束"实现：注册到 fastify 的 routerOptions.constraints 中，
   * 利用 find-my-way 的约束机制在路由匹配阶段完成版本筛选。
   * - validate：校验路由声明的版本必须是字符串或字符串数组；
   * - storage：以版本号为键存储/查找/删除路由节点的存储器；
   * - deriveConstraint：在收到请求时从请求中提取版本号，与声明的版本比对。
   */
  private readonly versionConstraint = {
    name: 'version',
    validate(value: unknown) {
      if (!isString(value) && !Array.isArray(value)) {
        throw new Error(
          'Version constraint should be a string or an array of strings.',
        );
      }
    },
    storage() {
      const versions = new Map<string, unknown>();
      return {
        get(version: string | Array<string>) {
          if (Array.isArray(version)) {
            return versions.get(version.find(v => versions.has(v))!) || null;
          }
          return versions.get(version) || null;
        },
        set(versionOrVersions: string | Array<string>, store: unknown) {
          const storeVersionConstraint = (version: string) =>
            versions.set(version, store);
          if (Array.isArray(versionOrVersions))
            versionOrVersions.forEach(storeVersionConstraint);
          else storeVersionConstraint(versionOrVersions);
        },
        del(version: string | Array<string>) {
          if (Array.isArray(version)) {
            version.forEach(v => versions.delete(v));
          } else {
            versions.delete(version);
          }
        },
        empty() {
          versions.clear();
        },
      };
    },
    deriveConstraint: (req: FastifyRequest) => {
      // Media Type (Accept Header) Versioning Handler
      // 1. 媒体类型版本控制：解析 Accept 头中分号后的版本参数（如 ;v=2）
      if (this.versioningOptions?.type === VersioningType.MEDIA_TYPE) {
        const MEDIA_TYPE_HEADER = 'Accept';
        const acceptHeaderValue: string | undefined = (req.headers?.[
          MEDIA_TYPE_HEADER
        ] || req.headers?.[MEDIA_TYPE_HEADER.toLowerCase()]) as string;

        const acceptHeaderVersionParameter = acceptHeaderValue
          ? acceptHeaderValue.split(';')[1]
          : '';

        return isUndefined(acceptHeaderVersionParameter)
          ? VERSION_NEUTRAL // No version was supplied
          : acceptHeaderVersionParameter.split(this.versioningOptions.key)[1];
      }
      // Header Versioning Handler
      // 2. 自定义 Header 版本控制：读取指定请求头中的版本号
      else if (this.versioningOptions?.type === VersioningType.HEADER) {
        const customHeaderVersionParameter: string | string[] | undefined =
          req.headers?.[this.versioningOptions.header] ||
          req.headers?.[this.versioningOptions.header.toLowerCase()];

        return isUndefined(customHeaderVersionParameter)
          ? VERSION_NEUTRAL // No version was supplied
          : customHeaderVersionParameter;
      }
      // Custom Versioning Handler
      // 3. 自定义提取器版本控制：直接交给用户提供的 extractor 提取版本
      else if (this.versioningOptions?.type === VersioningType.CUSTOM) {
        return this.versioningOptions.extractor(req);
      }
      return undefined;
    },
    mustMatchWhenDerived: false,
  };

  /** 是否已注册默认内容解析器 */
  get isParserRegistered(): boolean {
    return !!this._isParserRegistered;
  }

  /**
   * 创建适配器实例。
   *
   * @param instanceOrOptions - 可传入已有的 Fastify 实例，或各类启动选项
   *   （普通 HTTP/HTTPS、HTTP2，以及 NestJS 特有的 skipMiddie）；
   *   不传时内部调用 fastify() 新建实例，并把 versionConstraint 注册进
   *   routerOptions.constraints 以支持路由级版本控制。
   */
  constructor(
    instanceOrOptions?:
      | TInstance
      | FastifyHttp2Options<any>
      | FastifyHttp2SecureOptions<any>
      | FastifyHttpsOptions<any>
      | FastifyHttpOptions<any>
      | FastifyAdapterBaseOptions<TServer>,
  ) {
    super();

    // 1. 若传入对象带有 server 属性则视为 Fastify 实例直接复用；
    //    否则视为配置对象，新建 fastify 实例并注入版本约束
    const instance =
      instanceOrOptions && (instanceOrOptions as TInstance).server
        ? instanceOrOptions
        : fastify({
            ...(instanceOrOptions as FastifyServerOptions),
            routerOptions: {
              ...(instanceOrOptions as FastifyServerOptions)?.routerOptions,
              constraints: {
                version: this.versionConstraint as any,
              },
            },
          });

    this.setInstance(instance);

    // 2. skipMiddie 选项：跳过 middie 注册（不支持 Express 风格中间件）
    if ((instanceOrOptions as FastifyAdapterBaseOptions)?.skipMiddie) {
      this.isMiddieRegistered = true;
    }

    // 3. 注册 onRequest/onResponse 占位钩子，转发给 setOnRequestHook/setOnResponseHook 设置的钩子
    this.instance.addHook('onRequest', (request, reply, done) => {
      if (this.onRequestHook) {
        this.onRequestHook(request as TRequest, reply as TReply, done);
      } else {
        done();
      }
    });

    this.instance.addHook('onResponse', (request, reply, done) => {
      if (this.onResponseHook) {
        this.onResponseHook(request as TRequest, reply as TReply, done);
      } else {
        done();
      }
    });
  }

  /**
   * 注册请求进入钩子，在 Fastify 的 onRequest 生命周期阶段调用。
   *
   * @param hook - 钩子函数（请求、响应、done 回调）
   */
  public setOnRequestHook(
    hook: (
      request: TRequest,
      reply: TReply,
      done: (err?: Error) => void,
    ) => void | Promise<void>,
  ) {
    this.onRequestHook = hook;
  }

  /**
   * 注册响应结束钩子，在 Fastify 的 onResponse 生命周期阶段调用。
   *
   * @param hook - 钩子函数（请求、响应、done 回调）
   */
  public setOnResponseHook(
    hook: (
      request: TRequest,
      reply: TReply,
      done: (err?: Error) => void,
    ) => void | Promise<void>,
  ) {
    this.onResponseHook = hook;
  }

  /**
   * 应用初始化：注册 middie 插件（提供 Express 风格中间件支持），
   * 并补挂初始化之前通过 use() 排队的中间件。
   */
  public async init() {
    // 1. 已注册（或 skipMiddie 跳过）则无需处理
    if (this.isMiddieRegistered) {
      return;
    }
    await this.registerMiddie();

    // Register any pending middlewares that were added before init
    // 2. 把 init 之前排队等待的中间件逐一挂载并清空队列
    if (this.pendingMiddlewares.length > 0) {
      for (const { args } of this.pendingMiddlewares) {
        (this.instance.use as any)(...args);
      }
      this.pendingMiddlewares = [];
    }
  }

  /**
   * 启动底层服务器监听指定端口。
   *
   * @param port - 监听的端口号或 socket 路径
   * @param callback - 监听成功后的回调函数
   */
  public listen(port: string | number, callback?: () => void): void;
  /**
   * 启动底层服务器监听指定主机名与端口。
   *
   * @param port - 监听的端口号
   * @param hostname - 绑定的主机名
   * @param callback - 监听成功后的回调函数
   */
  public listen(
    port: string | number,
    hostname: string,
    callback?: () => void,
  ): void;
  /**
   * 启动底层 Fastify 服务器监听（统一实现）。
   * 与 Express 不同，Fastify 的 listen 接受选项对象，
   * 因此这里把各种重载参数归一化为 { port, host/path } 对象。
   *
   * @param listenOptions - 端口号、socket 路径或 FastifyListenOptions 对象
   * @param args - 其余参数（主机名、回调等）
   */
  public listen(
    listenOptions: string | number | FastifyListenOptions,
    ...args: any[]
  ): void {
    // 1. 从参数中拆出回调（回调可能在主机名之前或之后）
    const isFirstArgTypeofFunction = typeof args[0] === 'function';
    const callback = isFirstArgTypeofFunction ? args[0] : args[1];

    // 2. 第一个参数若为含 host/port/path 的对象则直接作为监听选项，否则包装成 { port }
    let options: Record<string, any>;
    if (
      typeof listenOptions === 'object' &&
      (listenOptions.host !== undefined ||
        listenOptions.port !== undefined ||
        listenOptions.path !== undefined)
    ) {
      // First parameter is an object with a path, port and/or host attributes
      options = listenOptions;
    } else {
      options = {
        port: +listenOptions,
      };
    }
    // 3. 第二个参数为主机名时写入选项
    if (!isFirstArgTypeofFunction) {
      options.host = args[0];
    }
    return this.instance.listen(options, callback);
  }

  /** 注册 GET 路由（转发到 injectRouteOptions，下同） */
  public get(...args: any[]) {
    return this.injectRouteOptions('GET', ...args);
  }

  /** 注册 POST 路由 */
  public post(...args: any[]) {
    return this.injectRouteOptions('POST', ...args);
  }

  /** 注册 HEAD 路由 */
  public head(...args: any[]) {
    return this.injectRouteOptions('HEAD', ...args);
  }

  /** 注册 DELETE 路由 */
  public delete(...args: any[]) {
    return this.injectRouteOptions('DELETE', ...args);
  }

  /** 注册 PUT 路由 */
  public put(...args: any[]) {
    return this.injectRouteOptions('PUT', ...args);
  }

  /** 注册 PATCH 路由 */
  public patch(...args: any[]) {
    return this.injectRouteOptions('PATCH', ...args);
  }

  /** 注册 OPTIONS 路由 */
  public options(...args: any[]) {
    return this.injectRouteOptions('OPTIONS', ...args);
  }

  /** 注册 SEARCH 路由 */
  public search(...args: any[]) {
    return this.injectRouteOptions('SEARCH', ...args);
  }

  /** 注册 PROPFIND 路由（WebDAV） */
  public propfind(...args: any[]) {
    return this.injectRouteOptions('PROPFIND', ...args);
  }

  /** 注册 PROPPATCH 路由（WebDAV） */
  public proppatch(...args: any[]) {
    return this.injectRouteOptions('PROPPATCH', ...args);
  }

  /** 注册 MKCOL 路由（WebDAV） */
  public mkcol(...args: any[]) {
    return this.injectRouteOptions('MKCOL', ...args);
  }

  /** 注册 COPY 路由（WebDAV） */
  public copy(...args: any[]) {
    return this.injectRouteOptions('COPY', ...args);
  }

  /** 注册 MOVE 路由（WebDAV） */
  public move(...args: any[]) {
    return this.injectRouteOptions('MOVE', ...args);
  }

  /** 注册 LOCK 路由（WebDAV） */
  public lock(...args: any[]) {
    return this.injectRouteOptions('LOCK', ...args);
  }

  /** 注册 UNLOCK 路由（WebDAV） */
  public unlock(...args: any[]) {
    return this.injectRouteOptions('UNLOCK', ...args);
  }

  /**
   * 为路由处理函数附加版本信息。与 Express 适配器不同，这里不包装处理函数，
   * 而是把 version / versioningOptions 直接附加到处理函数引用上；
   * 真正的版本匹配由 find-my-way 的版本约束（versionConstraint.deriveConstraint）
   * 在路由匹配阶段完成。
   *
   * @param handler - 原始路由处理函数
   * @param version - 路由声明的版本（字符串、版本数组或 VERSION_NEUTRAL）
   * @param versioningOptions - 全局版本控制配置
   * @returns 附加了版本元信息的处理函数
   */
  public applyVersionFilter(
    handler: Function,
    version: VersionValue,
    versioningOptions: VersioningOptions,
  ): VersionedRoute<TRequest, TReply> {
    // 1. 首次调用时缓存全局版本控制配置，供约束提取器读取
    if (!this.versioningOptions) {
      this.versioningOptions = versioningOptions;
    }
    // 2. 直接把版本信息挂到处理函数引用上
    const versionedRoute = handler as VersionedRoute<TRequest, TReply>;
    versionedRoute.version = version;
    return versionedRoute;
  }

  /**
   * 将路由处理结果写回 Fastify 响应。
   * 若传入的是原生 ServerResponse（尚未包装为 Reply 门面），会手动构造一个
   * FastifyReply 实例（跳过 preValidation/preHandler 等中间钩子）再发送。
   *
   * @param response - FastifyReply 或原生响应对象
   * @param body - 要写回的响应体（可为 StreamableFile、对象、字符串或空值）
   * @param statusCode - 可选的 HTTP 状态码
   */
  public reply(
    response: TRawResponse | TReply,
    body: any,
    statusCode?: number,
  ) {
    // 1. 原生响应对象需要先包装成 Reply 门面（附上空的生命周期钩子上下文）
    const fastifyReply: TReply = this.isNativeResponse(response)
      ? new Reply(
          response,
          {
            [kRouteContext]: {
              preSerialization: null,
              preValidation: [],
              preHandler: [],
              onSend: [],
              onError: [],
            },
          },
          {},
        )
      : response;

    // 2. 设置状态码
    if (statusCode) {
      fastifyReply.status(statusCode);
    }
    // 3. StreamableFile：仅在用户未自行设置时补充流相关响应头，然后发送文件流
    if (body instanceof StreamableFile) {
      const streamHeaders = body.getHeaders();
      if (
        fastifyReply.getHeader('Content-Type') === undefined &&
        streamHeaders.type !== undefined
      ) {
        fastifyReply.header('Content-Type', streamHeaders.type);
      }
      if (
        fastifyReply.getHeader('Content-Disposition') === undefined &&
        streamHeaders.disposition !== undefined
      ) {
        fastifyReply.header('Content-Disposition', streamHeaders.disposition);
      }
      if (
        fastifyReply.getHeader('Content-Length') === undefined &&
        streamHeaders.length !== undefined
      ) {
        fastifyReply.header('Content-Length', streamHeaders.length);
      }
      body = body.getStream();
    }
    // 4. 内容类型非 JSON 且状态码为 4xx/5xx 时警告可能缺少自定义异常过滤器，并强制改为 JSON
    if (
      fastifyReply.getHeader('Content-Type') !== undefined &&
      fastifyReply.getHeader('Content-Type') !== 'application/json' &&
      body?.statusCode >= HttpStatus.BAD_REQUEST
    ) {
      Logger.warn(
        "Content-Type doesn't match Reply body, you might need a custom ExceptionFilter for non-JSON responses",
        FastifyAdapter.name,
      );
      fastifyReply.header('Content-Type', 'application/json');
    }
    // 5. 通过 reply.send() 真正写出响应体
    return fastifyReply.send(body);
  }

  /**
   * 设置响应的 HTTP 状态码。原生响应直接赋值 statusCode，
   * Reply 门面则调用其 code() 方法。
   *
   * @param response - FastifyReply 或原生响应对象
   * @param statusCode - HTTP 状态码
   */
  public status(response: TRawResponse | TReply, statusCode: number) {
    if (this.isNativeResponse(response)) {
      response.statusCode = statusCode;
      return response;
    }
    return (response as { code: Function }).code(statusCode);
  }

  /**
   * 立即结束底层原始响应（绕过 Reply 门面直接操作 raw 流）。
   *
   * @param response - FastifyReply 对象
   * @param message - 可选的响应体内容
   */
  public end(response: TReply, message?: string) {
    response.raw.end(message!);
  }

  /**
   * 渲染服务端模板视图（依赖已注册的 @fastify/view 插件注入的 view 方法）。
   *
   * @param response - FastifyReply 对象
   * @param view - 视图名称
   * @param options - 传给模板引擎的渲染数据
   */
  public render(
    response: TReply & { view: Function },
    view: string,
    options: any,
  ) {
    return response && response.view(view, options);
  }

  /**
   * 执行 HTTP 重定向。未指定状态码时默认使用 302（FOUND）。
   *
   * @param response - FastifyReply 对象
   * @param statusCode - 重定向使用的状态码（如 301、302）
   * @param url - 目标地址
   */
  public redirect(response: TReply, statusCode: number, url: string) {
    const code = statusCode ?? HttpStatus.FOUND;
    return response.status(code).redirect(url);
  }

  /**
   * 注册全局错误处理中间件（透传给 Fastify 的 setErrorHandler）。
   *
   * @param handler - 错误处理函数
   */
  public setErrorHandler(handler: Parameters<TInstance['setErrorHandler']>[0]) {
    return this.instance.setErrorHandler(handler);
  }

  /**
   * 注册 404（未匹配到任何路由）处理函数（透传给 Fastify 的 setNotFoundHandler）。
   *
   * @param handler - 未找到路由时的处理函数
   */
  public setNotFoundHandler(handler: Function) {
    return this.instance.setNotFoundHandler(handler as any);
  }

  /**
   * 获取底层 HTTP 服务器实例。
   *
   * @returns Fastify 托管的原生 Server 实例
   */
  public getHttpServer<T = TServer>(): T {
    return this.instance.server as unknown as T;
  }

  /**
   * 获取底层 Fastify 应用实例。
   *
   * @returns Fastify 实例
   */
  public getInstance<T = TInstance>(): T {
    return this.instance as unknown as T;
  }

  /**
   * 注册 Fastify 插件（原生 fastify.register() 的包装），
   * 是 Fastify 生态扩展（静态资源、视图、CORS 等）的统一入口。
   *
   * @param plugin - Fastify 插件（函数或动态导入的模块）
   * @param opts - 插件注册选项
   */
  public register<
    TRegister extends Parameters<
      FastifyRegister<FastifyInstance<TServer, TRawRequest, TRawResponse>>
    >,
  >(plugin: TRegister['0'], opts?: TRegister['1']) {
    return (this.instance.register as any)(plugin, opts);
  }

  /**
   * 原生 fastify.inject() 的包装：不经过网络即可向应用发起模拟请求
   * （常用于测试或 e2e 工具链）。
   *
   * @param opts - 注入的请求选项（方法、URL、载荷等）
   * @returns 不带参数时返回可链式构造的注入链；带参数时返回响应 Promise
   */
  public inject(): LightMyRequestChain;
  public inject(opts: InjectOptions | string): Promise<LightMyRequestResponse>;
  public inject(
    opts?: InjectOptions | string,
  ): LightMyRequestChain | Promise<LightMyRequestResponse> {
    return this.instance.inject(opts!);
  }

  /**
   * 关闭底层 Fastify 服务器。服务器已停止（ERR_SERVER_NOT_RUNNING）时
   * 静默忽略该错误，其余错误向上抛出。
   */
  public async close() {
    try {
      return await this.instance.close();
    } catch (err) {
      // Check if server is still running
      if (err.code !== 'ERR_SERVER_NOT_RUNNING') {
        throw err;
      }
      return;
    }
  }

  /**
   * 初始化底层 HTTP 服务器：直接复用 Fastify 实例自带的 server。
   */
  public initHttpServer() {
    this.httpServer = this.instance.server;
  }

  /**
   * 托管静态资源：按需加载 @fastify/static 插件并注册。
   *
   * @param options - @fastify/static 配置（root 必填，可选 prefix、通配符等）
   */
  public useStaticAssets(options: FastifyStaticOptions) {
    return this.register(
      loadPackage('@fastify/static', 'FastifyAdapter.useStaticAssets()', () =>
        require('@fastify/static'),
      ),
      options,
    );
  }

  /**
   * 设置服务端渲染视图引擎：按需加载 @fastify/view 插件并注册。
   * 与 Express 不同，Fastify 不支持仅传引擎名的字符串形式。
   *
   * @param options - @fastify/view 配置（engine、templates 等）；传字符串会报错退出
   */
  public setViewEngine(options: FastifyViewOptions | string) {
    if (isString(options)) {
      new Logger('FastifyAdapter').error(
        "setViewEngine() doesn't support a string argument.",
      );
      process.exit(1);
    }
    return this.register(
      loadPackage('@fastify/view', 'FastifyAdapter.setViewEngine()', () =>
        require('@fastify/view'),
      ),
      options,
    );
  }

  /**
   * 判断响应头是否已发送（Fastify 中对应 reply.sent 标志）。
   *
   * @param response - FastifyReply 对象
   * @returns 响应头是否已经发出
   */
  public isHeadersSent(response: TReply): boolean {
    return response.sent;
  }

  /**
   * 读取响应头。
   *
   * @param response - FastifyReply 对象
   * @param name - 响应头名称
   * @returns 对应响应头的值
   */
  public getHeader(response: any, name: string) {
    return response.getHeader(name);
  }

  /**
   * 设置响应头（覆盖已有值）。
   *
   * @param response - FastifyReply 对象
   * @param name - 响应头名称
   * @param value - 响应头值
   */
  public setHeader(response: TReply, name: string, value: string) {
    return response.header(name, value);
  }

  /**
   * 追加响应头值（Fastify 中没有独立的 append 方法，等效于 header()，
   * 传入数组即可追加多个值，用于 Set-Cookie 等）。
   *
   * @param response - FastifyReply 对象
   * @param name - 响应头名称
   * @param value - 追加的响应头值
   */
  public appendHeader(response: any, name: string, value: string) {
    response.header(name, value);
  }

  /**
   * 从请求对象中获取主机名。
   *
   * @param request - FastifyRequest 请求对象
   * @returns 请求的主机名
   */
  public getRequestHostname(request: TRequest): string {
    return request.hostname;
  }

  /**
   * 从请求对象中获取 HTTP 方法（优先取原生请求上的方法）。
   *
   * @param request - FastifyRequest 请求对象
   * @returns 请求方法（GET/POST 等）
   */
  public getRequestMethod(request: TRequest): string {
    return request.raw ? request.raw.method! : request.method;
  }

  /**
   * 从请求对象中获取原始 URL。
   *
   * @param request - FastifyRequest 或原生请求对象
   * @returns 原始请求 URL（优先 originalUrl，否则退回 url）
   */
  public getRequestUrl(request: TRequest): string;
  public getRequestUrl(request: TRawRequest): string;
  public getRequestUrl(request: TRequest & TRawRequest): string {
    return this.getRequestOriginalUrl(request.raw || request);
  }

  /**
   * 启用 CORS 跨域支持：动态 import @fastify/cors 插件并注册。
   *
   * @param options - @fastify/cors 配置对象
   */
  public enableCors(options?: FastifyCorsOptions) {
    this.register(
      import('@fastify/cors') as Parameters<TInstance['register']>[0],
      options,
    );
  }

  /**
   * 注册默认的 JSON 与 urlencoded 内容解析器（仅注册一次）。
   * 与 Express 的 registerParserMiddleware 不同，Fastify 通过
   * addContentTypeParser 注册解析器，而非挂载中间件；
   * 同时记录全局路由前缀 _pathPrefix，供后续路由注册时拼接。
   *
   * @param prefix - 全局挂载前缀
   * @param rawBody - 是否需要在请求对象上暴露原始 body（Buffer）
   */
  public registerParserMiddleware(prefix?: string, rawBody?: boolean) {
    // 1. 已注册过则直接返回，避免重复
    if (this._isParserRegistered) {
      return;
    }

    // 2. 分别注册 urlencoded 与 JSON 两种内容类型的解析器
    this.registerUrlencodedContentParser(rawBody);
    this.registerJsonContentParser(rawBody);

    this._isParserRegistered = true;
    // 3. 记录全局前缀（确保以 / 开头），注册路由时会自动拼接
    this._pathPrefix = prefix
      ? !prefix.startsWith('/')
        ? `/${prefix}`
        : prefix
      : undefined;
  }

  /**
   * 注册自定义内容解析器（原生 addContentTypeParser 的包装）。
   * rawBody 为 true 时会把原始 Buffer 挂到 req.rawBody；
   * 传入 parser 时使用自定义解析函数，否则把 Buffer 原样传递。
   *
   * @param type - 匹配的 Content-Type（字符串、数组或正则）
   * @param rawBody - 是否需要暴露原始请求体
   * @param options - 解析器选项（会自动追加 parseAs: 'buffer'）
   * @param parser - 可选的自定义解析函数
   */
  public useBodyParser(
    type: string | string[] | RegExp,
    rawBody: boolean,
    options?: NestFastifyBodyParserOptions,
    parser?: FastifyBodyParser<Buffer, TServer>,
  ) {
    // 1. 合并选项并强制以 Buffer 形式传入请求体
    const parserOptions = {
      ...(options || {}),
      parseAs: 'buffer' as const,
    };

    // 2. 注册内容解析器：rawBody 时保存原始 Buffer，再交给自定义/默认解析逻辑
    this.getInstance().addContentTypeParser<Buffer>(
      type,
      parserOptions,
      (
        req: RawBodyRequest<FastifyRequest<any, TServer, TRawRequest>>,
        body: Buffer,
        done,
      ) => {
        if (rawBody === true && Buffer.isBuffer(body)) {
          req.rawBody = body;
        }

        if (parser) {
          parser(req, body, done);
          return;
        }

        done(null, body);
      },
    );

    // To avoid the Nest application init to override our custom
    // body parser, we mark the parsers as registered.
    // 3. 标记为已注册，防止应用初始化时用默认解析器覆盖自定义解析器
    this._isParserRegistered = true;
  }

  /**
   * 创建按 HTTP 方法注册路由的工厂函数（异步：需先确保 middie 已注册）。
   * 与 Express 直接调用 app.get() 不同，这里基于 middie 把 NestJS 路由
   * 作为带路径匹配的中间件挂载，并自行处理旧版路由语法转换、全局前缀、
   * 正则结尾符与 URL 规范化。
   *
   * @param requestMethod - 请求方法（GET/POST 等）
   * @returns 一个 (path, callback) => any 形式的路由注册函数
   */
  public async createMiddlewareFactory(
    requestMethod: RequestMethod,
  ): Promise<(path: string, callback: Function) => any> {
    // 1. middie 未注册时先注册（中间件能力依赖它）
    if (!this.isMiddieRegistered) {
      await this.registerMiddie();
    }
    return (path: string, callback: Function) => {
      // 2. 记录并剥离路径结尾的 $（正则结束符），匹配时再补回
      const hasEndOfStringCharacter = path.endsWith('$');
      path = hasEndOfStringCharacter ? path.slice(0, -1) : path;

      // 3. 把旧版路由语法（如 * 通配符）转换为新版语法
      let normalizedPath = LegacyRouteConverter.tryConvert(path);

      // Fallback to "*path" to support plugins like GraphQL
      normalizedPath = normalizedPath === '/*path' ? '*path' : normalizedPath;

      // Normalize the path to support the prefix if it set in application
      // 4. 拼接全局路由前缀；前缀路径若以 / 结尾则追加 {*path} 通配
      if (this._pathPrefix && !normalizedPath.startsWith(this._pathPrefix)) {
        normalizedPath = `${this._pathPrefix}${normalizedPath}`;
        if (normalizedPath.endsWith('/')) {
          normalizedPath = `${normalizedPath}{*path}`;
        }
      }

      try {
        // 5. 生成路径匹配正则（必要时在其后拼接 $ 以恢复精确匹配语义）
        let { regexp: re } = pathToRegexp(normalizedPath);
        re = hasEndOfStringCharacter
          ? new RegExp(re.source + '$', re.flags)
          : re;

        // The following type assertion is valid as we use import('@fastify/middie') rather than require('@fastify/middie')
        // ref https://github.com/fastify/middie/pull/55
        // 6. 通过 middie 挂载带路径过滤的中间件：先去掉查询串、规范化 URL，
        //    再用正则匹配 pathname，匹配成功才执行真正的路由处理函数
        this.instance.use(
          normalizedPath,
          (req: any, res: any, next: Function) => {
            const queryParamsIndex = req.originalUrl.indexOf('?');
            let pathname =
              queryParamsIndex >= 0
                ? req.originalUrl.slice(0, queryParamsIndex)
                : req.originalUrl;

            pathname = this.sanitizeUrl(pathname);

            if (!re.exec(pathname + '/') && normalizedPath) {
              return next();
            }
            return callback(req, res, next);
          },
        );
      } catch (e) {
        // 7. 路径非法（TypeError）时打印旧版语法错误提示后原样抛出
        if (e instanceof TypeError) {
          LegacyRouteConverter.printError(path);
        }
        throw e;
      }
    };
  }

  /**
   * 返回适配器类型标识。
   *
   * @returns 固定为 'fastify'
   */
  public getType(): string {
    return 'fastify';
  }

  /**
   * 注册 Express 风格中间件。Fastify 原生不支持中间件，
   * 这里依赖 middie 插件：未注册时先把中间件加入等待队列，
   * init() 注册 middie 后再统一挂载。
   *
   * @param args - 中间件参数（可为处理函数或 "路径, 处理函数" 组合）
   * @returns 适配器自身（支持链式调用）
   */
  public use(...args: any[]) {
    // Fastify requires @fastify/middie plugin to be registered before middleware can be used.
    // If middie is not registered yet, we queue the middleware and register it later during init.
    if (!this.isMiddieRegistered) {
      this.pendingMiddlewares.push({ args });
      return this;
    }
    return (this.instance.use as any)(...args);
  }

  /**
   * 以指定前缀注册 Fastify 插件（如各控制器的子应用/插件）。
   *
   * @param factory - 插件工厂（回调或异步形式，或其动态导入结果）
   * @param prefix - 插件挂载的路由前缀，默认 '/'
   */
  protected registerWithPrefix(
    factory:
      | FastifyPluginCallback<any>
      | FastifyPluginAsync<any>
      | Promise<{ default: FastifyPluginCallback<any> }>
      | Promise<{ default: FastifyPluginAsync<any> }>,
    prefix = '/',
  ) {
    return this.instance.register(factory, { prefix });
  }

  /**
   * 判断传入的响应是否为原生 ServerResponse（而非 Reply 门面）：
   * Reply 门面上一定存在 status 方法，据此区分。
   *
   * @param response - 响应对象（原生或 Reply 门面）
   * @returns 是否为原生响应对象
   */
  private isNativeResponse(
    response: TRawResponse | TReply,
  ): response is TRawResponse {
    return !('status' in response);
  }

  /**
   * 注册默认 JSON 内容解析器。
   * 复用 Fastify 实例的默认 JSON 解析器（保留其 proto poisoning 等安全配置），
   * 并透传 initialConfig 中的 bodyLimit；rawBody 时额外暴露原始 Buffer。
   *
   * @param rawBody - 是否需要在请求对象上暴露原始 body
   */
  private registerJsonContentParser(rawBody?: boolean) {
    const contentType = 'application/json';
    const withRawBody = !!rawBody;
    const { bodyLimit } = this.getInstance().initialConfig;

    this.useBodyParser(
      contentType,
      withRawBody,
      { bodyLimit },
      (req, body, done) => {
        const { onProtoPoisoning, onConstructorPoisoning } =
          this.instance.initialConfig;
        const defaultJsonParser = this.instance.getDefaultJsonParser(
          onProtoPoisoning || 'error',
          onConstructorPoisoning || 'error',
        ) as FastifyBodyParser<string | Buffer, TServer>;
        defaultJsonParser(req, body, done);
      },
    );
  }

  /**
   * 注册 urlencoded 表单内容解析器：
   * 用 fast-querystring 把 Buffer 快速解析为对象
   * （性能优于 querystring，与 Fastify 内部实现保持一致）。
   *
   * @param rawBody - 是否需要在请求对象上暴露原始 body
   */
  private registerUrlencodedContentParser(rawBody?: boolean) {
    const contentType = 'application/x-www-form-urlencoded';
    const withRawBody = !!rawBody;
    const { bodyLimit } = this.getInstance().initialConfig;

    this.useBodyParser(
      contentType,
      withRawBody,
      { bodyLimit },
      (_req, body, done) => {
        done(null, querystringParse(body.toString()));
      },
    );
  }

  /**
   * 注册内部实现的 middie 插件（@fastify/middie 的克隆版），
   * 为 Fastify 提供 Express 风格中间件（app.use）能力。
   */
  private async registerMiddie() {
    this.isMiddieRegistered = true;
    await this.register(middie as Parameters<TInstance['register']>[0]);
  }

  /**
   * 读取原始请求的 URL：优先使用 middie 注入的 originalUrl
   * （含挂载前缀的完整地址），否则退回 request.url。
   *
   * @param rawRequest - 原生请求对象
   */
  private getRequestOriginalUrl(rawRequest: TRawRequest) {
    return rawRequest.originalUrl || rawRequest.url!;
  }

  /**
   * 注册路由的核心实现：把 NestJS 的路由描述转换为 Fastify 的 RouteOptions
   * 并通过 instance.route() 注入。版本约束、路由 config/schema 等装饰器
   * 元数据也在此读取并合并进路由选项。
   *
   * @param routerMethodKey - HTTP 方法名（GET/POST 等）
   * @param args - [路径, 处理函数] 或仅 [处理函数]
   */
  private injectRouteOptions(
    routerMethodKey: Uppercase<HTTPMethods>,
    ...args: any[]
  ) {
    // 1. 取出处理函数，并检查其是否被 applyVersionFilter 附加了版本信息
    const handlerRef = args[args.length - 1];
    const isVersioned =
      !isUndefined(handlerRef.version) &&
      handlerRef.version !== VERSION_NEUTRAL;
    // 2. 读取 RouteConfig/RouteConstraints/RouteSchema 装饰器写入的元数据
    const routeConfig = Reflect.getMetadata(
      FASTIFY_ROUTE_CONFIG_METADATA,
      handlerRef,
    );

    const routeConstraints = Reflect.getMetadata(
      FASTIFY_ROUTE_CONSTRAINTS_METADATA,
      handlerRef,
    );

    const routeSchema = Reflect.getMetadata(
      FASTIFY_ROUTE_SCHEMA_METADATA,
      handlerRef,
    );

    const hasConfig = !isUndefined(routeConfig);
    const hasConstraints = !isUndefined(routeConstraints);
    const hasSchema = !isUndefined(routeSchema);
    // 3. 构建基础路由描述（方法、路径、处理函数）
    const routeToInject: RouteOptions<TServer, TRawRequest, TRawResponse> &
      RouteShorthandOptions = {
      method: routerMethodKey,
      url: args[0],
      handler: handlerRef,
    };

    // 4. Fastify 默认不支持的方法（如 WebDAV）需先动态注册到实例上
    if (this.instance.supportedMethods.indexOf(routerMethodKey) === -1) {
      this.instance.addHttpMethod(routerMethodKey, { hasBody: true });
    }

    // 5. 存在版本/约束/配置/schema 元数据时，合并进路由选项再注册
    if (isVersioned || hasConstraints || hasConfig || hasSchema) {
      const isPathAndRouteTuple = args.length === 2;
      if (isPathAndRouteTuple) {
        // 5.1 合并路由约束：装饰器声明的 constraints + 版本约束
        const constraints = {
          ...(hasConstraints && routeConstraints),
          ...(isVersioned && {
            version: handlerRef.version,
          }),
        };

        const options = {
          constraints,
          ...(hasConfig && {
            config: {
              ...routeConfig,
            },
          }),
          ...(hasSchema && {
            schema: routeSchema,
          }),
        };

        const routeToInjectWithOptions = { ...routeToInject, ...options };

        return this.instance.route(routeToInjectWithOptions);
      }
    }
    // 6. 无附加元数据时按基础描述注册
    return this.instance.route(routeToInject);
  }

  /**
   * 按 Fastify initialConfig 对 URL 做规范化处理，
   * 与路由注册时使用的 routerOptions 保持一致的匹配语义。
   *
   * @param url - 仅含 pathname 的 URL（不含查询串）
   * @returns 规范化并安全解码后的路径
   */
  private sanitizeUrl(url: string): string {
    const initialConfig = this.instance.initialConfig as FastifyServerOptions;
    const routerOptions =
      initialConfig.routerOptions as Partial<FastifyServerOptions>;

    // 1. 可选：合并重复斜杠（//a///b -> /a/b）
    if (
      routerOptions.ignoreDuplicateSlashes ||
      initialConfig.ignoreDuplicateSlashes
    ) {
      url = this.removeDuplicateSlashes(url);
    }

    // 2. 可选：忽略结尾斜杠（/path/ -> /path）
    if (
      routerOptions.ignoreTrailingSlash ||
      initialConfig.ignoreTrailingSlash
    ) {
      url = this.trimLastSlash(url);
    }

    // 3. 可选：大小写不敏感匹配
    if (
      routerOptions.caseSensitive === false ||
      initialConfig.caseSensitive === false
    ) {
      url = url.toLowerCase();
    }
    // 4. 安全解码 URL（防绕过），必要时以分号作为查询串分隔符
    return safeDecodeURI(
      url,
      routerOptions.useSemicolonDelimiter ||
        initialConfig.useSemicolonDelimiter,
    ).path;
  }

  /** 去除路径中的重复斜杠 */
  private removeDuplicateSlashes(path: string) {
    const REMOVE_DUPLICATE_SLASHES_REGEXP = /\/\/+/g;
    return path.indexOf('//') !== -1
      ? path.replace(REMOVE_DUPLICATE_SLASHES_REGEXP, '/')
      : path;
  }

  /** 去除路径结尾的斜杠（根路径 / 除外） */
  private trimLastSlash(path: string) {
    if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
      return path.slice(0, -1);
    }
    return path;
  }
}
