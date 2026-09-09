import { FastifyCorsOptions } from '@fastify/cors';
import { HttpServer, INestApplication } from '@nestjs/common';
import {
  FastifyBodyParser,
  FastifyInstance,
  FastifyListenOptions,
  FastifyPluginAsync,
  FastifyPluginCallback,
  FastifyPluginOptions,
  FastifyRegisterOptions,
  FastifyReply,
  FastifyRequest,
  RawServerBase,
  RawServerDefault,
} from 'fastify';
import {
  InjectOptions,
  Chain as LightMyRequestChain,
  Response as LightMyRequestResponse,
} from 'light-my-request';
import { FastifyStaticOptions, FastifyViewOptions } from './external';
import { NestFastifyBodyParserOptions } from './nest-fastify-body-parser-options.interface';

/**
 * 描述 NestFastifyApplication 上方法的接口。
 *
 * @publicApi
 */
export interface NestFastifyApplication<
  TServer extends RawServerBase = RawServerDefault,
> extends INestApplication<TServer> {
  /**
   * 返回绑定到 Fastify 应用程序的底层 HTTP 适配器。
   *
   * @returns {HttpServer}
   */
  getHttpAdapter(): HttpServer<FastifyRequest, FastifyReply, FastifyInstance>;

  /**
   * 原生 `fastify.register()` 方法的包装函数，用于注册 Fastify 插件。
   * 示例：`app.register(require('@fastify/formbody'))`
   *
   * @param plugin - Fastify 插件（回调或异步形式，或其动态导入结果）
   * @param opts - 插件注册选项
   * @returns {Promise<FastifyInstance>}
   */
  register<Options extends FastifyPluginOptions = any>(
    plugin:
      | FastifyPluginCallback<Options>
      | FastifyPluginAsync<Options>
      | Promise<{ default: FastifyPluginCallback<Options> }>
      | Promise<{ default: FastifyPluginAsync<Options> }>,
    opts?: FastifyRegisterOptions<Options>,
  ): Promise<FastifyInstance>;

  /**
   * 动态注册 Fastify body 解析器。将遵守应用程序的 `rawBody` 选项。
   *
   * @example
   * const app = await NestFactory.create<NestFastifyApplication>(
   *   AppModule,
   *   new FastifyAdapter(),
   *   { rawBody: true }
   * );
   * // 启用 json 解析器并把大小限制设为 50mb
   * app.useBodyParser('application/json', { bodyLimit: 50 * 1000 * 1024 });
   *
   * @param type - 匹配的 Content-Type（字符串、数组或正则）
   * @param options - 解析器选项（如 bodyLimit）
   * @param parser - 可选的自定义解析函数
   * @returns {this}
   */
  useBodyParser<TServer extends RawServerBase = RawServerBase>(
    type: string | string[] | RegExp,
    options?: NestFastifyBodyParserOptions,
    parser?: FastifyBodyParser<Buffer, TServer>,
  ): this;

  /**
   * 以 @fastify/static 配置对象的方式托管静态资源。
   * 示例：`app.useStaticAssets({ root: 'public' })`
   *
   * @param options - @fastify/static 配置（root 必填）
   * @returns {this}
   */
  useStaticAssets(options: FastifyStaticOptions): this;

  /**
   * 启用 CORS（跨域资源共享）。
   *
   * @param options - @fastify/cors 配置对象
   * @returns {void}
   */
  enableCors(options?: FastifyCorsOptions): void;

  /**
   * 为模板（视图）设置视图引擎，例如 `pug`、`handlebars` 或 `ejs`。
   *
   * 不要传入字符串。参数中的字符串类型仅为兼容性保留，传入会抛出异常。
   * @param options - @fastify/view 配置对象
   * @returns {this}
   */
  setViewEngine(options: FastifyViewOptions | string): this;

  /**
   * 原生 `fastify.inject()` 方法的包装函数：
   * 不经过网络即可向应用发起模拟请求（常用于测试）。
   *
   * @param opts - 注入的请求选项（方法、URL、载荷等）
   * @returns {void}
   */
  inject(): LightMyRequestChain;
  inject(opts: InjectOptions | string): Promise<LightMyRequestResponse>;

  /**
   * 启动应用程序。
   *
   * @param opts - Fastify 监听选项（port/host/path 等）
   * @param callback - 监听完成后的回调函数
   * @returns 一个 Promise，解析后是对底层 HttpServer 的引用。
   */
  listen(
    opts: FastifyListenOptions,
    callback?: (err: Error | null, address: string) => void,
  ): Promise<TServer>;
  listen(opts?: FastifyListenOptions): Promise<TServer>;
  listen(
    callback?: (err: Error | null, address: string) => void,
  ): Promise<TServer>;
  listen(
    port: number | string,
    callback?: (err: Error | null, address: string) => void,
  ): Promise<TServer>;
  listen(
    port: number | string,
    address: string,
    callback?: (err: Error | null, address: string) => void,
  ): Promise<TServer>;
  listen(
    port: number | string,
    address: string,
    backlog: number,
    callback?: (err: Error | null, address: string) => void,
  ): Promise<TServer>;
}
