/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-namespace */
import {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
  HookHandlerDoneFunction,
} from 'fastify';
import fp from 'fastify-plugin';
import { safeDecodeURI } from 'find-my-way/lib/url-sanitizer';
import * as http from 'node:http';
import { Path, pathToRegexp } from 'path-to-regexp';
import reusify = require('reusify');

/**
 * Express 风格中间件函数签名：接收请求、响应与 next 回调，
 * 处理完成后调用 next() 把控制权交给下一个中间件。
 */
export type MiddlewareFn<
  Req extends { url: string; originalUrl?: string },
  Res extends { finished?: boolean; writableEnded?: boolean },
  Ctx = unknown,
> = (req: Req, res: Res, next: (err?: unknown) => void) => void;

/** 单条中间件注册记录：可选的路径匹配正则 + 中间件函数 */
interface MiddlewareEntry<
  Req extends { url: string; originalUrl?: string },
  Res extends { finished?: boolean; writableEnded?: boolean },
  Ctx,
> {
  regexp?: RegExp;
  fn: MiddlewareFn<Req, Res, Ctx>;
}

function bindLast<F extends (...args: any[]) => any>(
  fn: F,
  last: Last<Parameters<F>>,
): (...args: DropLast<Parameters<F>>) => ReturnType<F> {
  return (...args: any[]) => fn(...args, last);
}

// Helper types
type Last<T extends any[]> = T extends [...any[], infer L] ? L : never;
type DropLast<T extends any[]> = T extends [...infer Rest, any] ? Rest : never;

/**
 * `@fastify/middie` 引擎的克隆版（见 https://github.com/fastify/middie），
 * 附带一个额外的安全修复：在路径匹配前先解码 URL，
 * 防止攻击者利用 URL 编码字符绕过中间件。
 *
 * 工作方式：use() 收集（路径前缀 + 中间件）列表；run() 在每个请求上
 * 依序执行匹配的中间件，全部执行完后调用 complete 回调交还控制权。
 * 通过 reusify 对象池复用 Holder 状态对象以降低 GC 开销。
 *
 * @param complete - 所有中间件执行完毕（或出错）后的完成回调
 * @param initialConfig - Fastify 实例的初始配置（用于 URL 规范化选项）
 */
function middie<
  Req extends { url: string; originalUrl?: string },
  Res extends { finished?: boolean; writableEnded?: boolean },
  Ctx = unknown,
>(
  complete: (err: unknown, req: Req, res: Res, ctx: Ctx) => void,
  initialConfig: FastifyServerOptions | null,
) {
  const middlewares: MiddlewareEntry<Req, Res, Ctx>[] = [];
  const pool = reusify(Holder as any);

  return {
    use,
    run: bindLast(run, initialConfig),
  };

  function use(
    this: unknown,
    url:
      | string
      | null
      | MiddlewareFn<Req, Res, Ctx>
      | MiddlewareFn<Req, Res, Ctx>[],
    f?: MiddlewareFn<Req, Res, Ctx> | MiddlewareFn<Req, Res, Ctx>[],
  ) {
    // 1. 未传路径时视为全局中间件（无路径前缀）
    if (f === undefined) {
      f = url as MiddlewareFn<Req, Res, Ctx> | MiddlewareFn<Req, Res, Ctx>[];
      url = null;
    }

    // 2. 带路径前缀时把前缀转换为正则（end:false 前缀匹配）
    let regexp: RegExp | undefined;
    if (typeof url === 'string') {
      const pathRegExp = pathToRegexp(sanitizePrefixUrl(url) as Path, {
        end: false,
      });
      regexp = pathRegExp.regexp;
    }

    // 3. 把中间件（可为数组）加入注册表
    if (Array.isArray(f)) {
      for (const val of f) {
        middlewares.push({ regexp, fn: val });
      }
    } else {
      middlewares.push({ regexp, fn: f });
    }

    return this;
  }

  function run(
    req: Req,
    res: Res,
    ctx: Ctx,
    initialConfig: FastifyServerOptions | null,
  ) {
    // 1. 没有注册任何中间件时直接完成
    if (!middlewares.length) {
      complete(null, req, res, ctx);
      return;
    }

    // 2. 把原始 URL 保存到 originalUrl（后续前缀剥离后 req.url 会被改写）
    req.originalUrl = req.url;

    // 3. 从对象池取出 Holder 状态对象并初始化，随后开始执行中间件链
    const holder = pool.get() as any as HolderInstance;
    holder.req = req;
    holder.res = res;
    holder.url = sanitizeUrl(req.url);
    holder.context = ctx;
    holder.initialConfig = initialConfig;
    holder.done();
  }

  /** 对象池中的状态对象接口：在中间件链执行期间携带请求上下文 */
  interface HolderInstance {
    req: Req | null;
    res: Res | null;
    url: string | null;
    context: Ctx | null;
    initialConfig: FastifyServerOptions | null;
    i: number;
    done: (err?: unknown) => void;
  }

  function Holder(this: HolderInstance) {
    this.req = null;
    this.res = null;
    this.url = null;
    this.context = null;
    this.initialConfig = null;
    this.i = 0;

    const that = this;

    // done() 推进中间件链：按索引 i 依次执行下一条匹配的中间件
    this.done = function (err?: unknown) {
      const req = that.req!;
      const res = that.res!;
      const url = that.url!;
      const context = that.context!;
      const i = that.i++;

      req.url = req.originalUrl!;

      // 1. 响应已结束则提前终止并归还对象
      if (res.finished === true || res.writableEnded === true) {
        cleanup();
        return;
      }

      // 2. 出错或全部执行完毕时调用 complete 回调交还控制权
      if (err || middlewares.length === i) {
        complete(err, req, res, context);
        cleanup();
      } else {
        const { fn, regexp } = middlewares[i];

        if (regexp) {
          // Decode URL before matching to avoid bypassing middleware
          // 3. 按 initialConfig 规范化 URL（重复斜杠/结尾斜杠/大小写）
          let sanitizedUrl = url;
          if (
            that.initialConfig!.ignoreDuplicateSlashes ||
            that.initialConfig!.routerOptions?.ignoreDuplicateSlashes
          ) {
            sanitizedUrl = removeDuplicateSlashes(sanitizedUrl);
          }

          if (
            that.initialConfig!.ignoreTrailingSlash ||
            that.initialConfig!.routerOptions?.ignoreTrailingSlash
          ) {
            sanitizedUrl = trimLastSlash(sanitizedUrl);
          }

          if (
            that.initialConfig!.caseSensitive === false ||
            that.initialConfig!.routerOptions?.caseSensitive === false
          ) {
            sanitizedUrl = sanitizedUrl.toLowerCase();
          }

          // 4. 安全修复的关键：先解码 URL 再匹配，防止编码字符绕过中间件
          const decodedUrl = safeDecodeURI(
            sanitizedUrl,
            (that.initialConfig?.routerOptions as any)?.useSemicolonDelimiter ||
              that.initialConfig?.useSemicolonDelimiter,
          ).path;
          const result = regexp.exec(decodedUrl);
          // 5. 匹配成功：从 req.url 中剥离前缀后执行中间件；否则跳到下一条
          if (result) {
            req.url = req.url.replace(result[0], '');
            if (req.url[0] !== '/') req.url = '/' + req.url;
            fn(req, res, that.done);
          } else {
            that.done();
          }
        } else {
          // 6. 无路径前缀的全局中间件直接执行
          fn(req, res, that.done);
        }
      }
    };

    /** 重置状态并把对象归还给 reusify 对象池 */
    function cleanup() {
      that.req = null;
      that.res = null;
      that.context = null;
      that.initialConfig = null;
      that.i = 0;
      pool.release(that as any);
    }
  }
}

/** 去除路径中的重复斜杠 */
function removeDuplicateSlashes(path: string) {
  const REMOVE_DUPLICATE_SLASHES_REGEXP = /\/\/+/g;
  return path.indexOf('//') !== -1
    ? path.replace(REMOVE_DUPLICATE_SLASHES_REGEXP, '/')
    : path;
}

/** 去除路径结尾的斜杠（根路径 / 除外） */
function trimLastSlash(path: string) {
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    return path.slice(0, -1);
  }
  return path;
}

/** 截掉查询串（?）与哈希（#）之后的内容，仅保留 pathname 部分 */
function sanitizeUrl(url: string): string {
  for (let i = 0, len = url.length; i < len; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 63 || charCode === 35) {
      return url.slice(0, i);
    }
  }
  return url;
}

/** 规范化中间件注册用的路径前缀（根路径视为空串，去掉结尾斜杠） */
function sanitizePrefixUrl(url: string): string {
  if (url === '/') return '';
  if (url[url.length - 1] === '/') return url.slice(0, -1);
  return url;
}

const kMiddlewares = Symbol('fastify-middie-middlewares');
const kMiddie = Symbol('fastify-middie-instance');
const kMiddieHasMiddlewares = Symbol('fastify-middie-has-middlewares');

/** 运行中间件时需要携带请求/响应载荷的 Fastify 生命周期钩子 */
const supportedHooksWithPayload = [
  'onError',
  'onSend',
  'preParsing',
  'preSerialization',
] as const;

/** 运行中间件时不需要额外载荷的 Fastify 生命周期钩子 */
const supportedHooksWithoutPayload = [
  'onRequest',
  'onResponse',
  'onTimeout',
  'preHandler',
  'preValidation',
] as const;

/** middie 支持挂载的全部钩子 */
const supportedHooks = [
  ...supportedHooksWithPayload,
  ...supportedHooksWithoutPayload,
] as const;

type SupportedHook = (typeof supportedHooks)[number];

/** middie 插件选项：可指定在哪个生命周期钩子上运行中间件（默认 onRequest） */
interface MiddieOptions {
  hook?: SupportedHook;
}

/**
 * middie 插件主体：为 Fastify 实例装饰 use() 方法，把收集到的
 * Express 风格中间件交给上方 middie 引擎执行。
 * 支持在任意 Fastify 生命周期钩子上运行（默认 onRequest），
 * 并通过 onRegister 在子实例（子作用域插件）中复制中间件注册表。
 */
function fastifyMiddie(
  fastify: FastifyInstance,
  options: MiddieOptions,
  next: (err?: Error) => void,
) {
  // 1. 在实例上装饰 use() 方法并初始化内部状态（中间件表、middie 引擎）
  fastify.decorate('use', use as any);
  fastify[kMiddlewares] = [];
  fastify[kMiddieHasMiddlewares] = false;
  fastify[kMiddie] = middie(onMiddieEnd, fastify.initialConfig);

  // 2. 校验目标钩子是否受支持（默认 onRequest）
  const hook = options.hook || 'onRequest';

  if (!supportedHooks.includes(hook)) {
    next(new Error(`The hook "${hook}" is not supported by fastify-middie`));
    return;
  }

  // 3. 在目标钩子上运行中间件引擎，并在子实例注册时同步状态
  fastify
    .addHook(
      hook,
      supportedHooksWithPayload.includes(hook as any)
        ? runMiddieWithPayload
        : runMiddie,
    )
    .addHook('onRegister', onRegister);

  /**
   * 注册中间件：带路径时拼接实例前缀（支持子作用域），
   * 同时写入实例的中间件表和 middie 引擎。
   */
  function use(this: FastifyInstance, path: string | null, fn?: Function) {
    if (typeof path === 'string') {
      const prefix = this.prefix;
      path = prefix + (path === '/' && prefix.length > 0 ? '' : path);
    }

    this[kMiddlewares].push([path, fn]);

    if (fn == null) {
      this[kMiddie].use(path);
    } else {
      this[kMiddie].use(path, fn);
    }

    this[kMiddieHasMiddlewares] = true;
    return this;
  }

  /**
   * 在生命周期钩子中运行中间件引擎：把 FastifyRequest 的派生属性
   * （id/hostname/protocol/ip/body 等）回填到原生请求上，
   * 让 Express 风格中间件可以像在 Express 中一样访问这些信息。
   */
  function runMiddie(
    this: FastifyInstance,
    req: FastifyRequest,
    reply: FastifyReply,
    next: HookHandlerDoneFunction,
  ) {
    if (this[kMiddieHasMiddlewares]) {
      const raw = req.raw as any;
      raw.id = req.id;
      raw.hostname = req.hostname;
      raw.protocol = req.protocol;
      raw.ip = req.ip;
      raw.ips = req.ips;
      raw.log = req.log;
      (req.raw as any).query = req.query;
      (reply.raw as any).log = req.log;
      if (req.body !== undefined) (req.raw as any).body = req.body;
      this[kMiddie].run(req.raw, reply.raw, next);
    } else {
      next();
    }
  }

  /** 带载荷钩子（onSend 等）的适配器：忽略 payload 参数后走 runMiddie */
  function runMiddieWithPayload(
    this: FastifyInstance,
    req: FastifyRequest,
    reply: FastifyReply,
    _payload: unknown,
    next: HookHandlerDoneFunction,
  ) {
    runMiddie.bind(this)(req, reply, next);
  }

  /** 中间件链执行结束的回调：把错误透传给 Fastify */
  function onMiddieEnd(
    err: unknown,
    _req: any,
    _res: any,
    next: (err?: unknown) => void,
  ) {
    next(err);
  }

  /** 子作用域实例注册时：为其重建 middie 引擎并复制已有的中间件注册 */
  function onRegister(instance: FastifyInstance) {
    const middlewares = instance[kMiddlewares].slice() as Array<Array<unknown>>;
    instance[kMiddlewares] = [];
    instance[kMiddie] = middie(onMiddieEnd, instance.initialConfig);
    instance[kMiddieHasMiddlewares] = false;
    instance.decorate('use', use as any);
    for (const middleware of middlewares) {
      (instance.use as any)(...middleware);
    }
  }

  next();
}

/* @eslint-disable-next-line @typescript-eslint/no-namespace */
/** fastifyMiddie 插件的类型命名空间（模拟官方 @fastify/middie 的类型声明） */
declare namespace fastifyMiddie {
  /** 插件选项：指定运行中间件的生命周期钩子 */
  export interface FastifyMiddieOptions {
    hook?:
      | 'onRequest'
      | 'preParsing'
      | 'preValidation'
      | 'preHandler'
      | 'preSerialization'
      | 'onSend'
      | 'onResponse'
      | 'onTimeout'
      | 'onError';
  }

  type FastifyMiddie =
    FastifyPluginCallback<fastifyMiddie.FastifyMiddieOptions>;

  /** 由插件回填的原生请求扩展字段（body、query） */
  export interface IncomingMessageExtended {
    body?: any;
    query?: any;
  }
  export type NextFunction = (err?: any) => void;
  export type SimpleHandleFunction = (
    req: http.IncomingMessage & IncomingMessageExtended,
    res: http.ServerResponse,
  ) => void;
  export type NextHandleFunction = (
    req: http.IncomingMessage & IncomingMessageExtended,
    res: http.ServerResponse,
    next: NextFunction,
  ) => void;

  /** 中间件处理函数类型：简单形式（不调用 next）或带 next 的形式 */
  export type Handler = SimpleHandleFunction | NextHandleFunction;

  export const fastifyMiddie: FastifyMiddie;
  export { fastifyMiddie as default };
}

declare module 'fastify' {
  /** 通过模块扩展（declaration merging）为 FastifyInstance 增加 Express 风格的 use() 方法 */
  interface FastifyInstance {
    use(fn: fastifyMiddie.Handler): this;
    use(route: string, fn: fastifyMiddie.Handler): this;
    use(routes: string[], fn: fastifyMiddie.Handler): this;
  }
}

/**
 * `@fastify/middie` 引擎的克隆版（见 https://github.com/fastify/middie），
 * 附带一个额外的安全修复：在路径匹配前先解码 URL，
 * 防止攻击者利用 URL 编码字符绕过中间件。
 * 通过 fastify-plugin 包装以跳过封装校验并声明兼容 Fastify 5.x。
 */
export default fp(fastifyMiddie, {
  fastify: '5.x',
  name: '@fastify/middie',
});

export { fastifyMiddie };
