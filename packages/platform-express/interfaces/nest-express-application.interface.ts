import { HttpServer, INestApplication } from '@nestjs/common';
import type {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Express } from 'express';
import type { Server as CoreHttpServer } from 'http';
import type { Server as CoreHttpsServer } from 'https';
import { NestExpressBodyParserOptions } from './nest-express-body-parser-options.interface';
import { NestExpressBodyParserType } from './nest-express-body-parser.interface';
import { ServeStaticOptions } from './serve-static-options.interface';

/**
 * 描述 NestExpressApplication 上方法的接口。
 *
 * @see [平台](https://docs.nestjs.cn/first-steps#platform)
 *
 * @publicApi
 */
export interface NestExpressApplication<
  TServer extends CoreHttpServer | CoreHttpsServer = CoreHttpServer,
> extends INestApplication<TServer> {
  /**
   * 返回绑定到 Express.js 应用程序的底层 HTTP 适配器。
   *
   * @returns {HttpServer}
   */
  getHttpAdapter(): HttpServer<Express.Request, Express.Response, Express>;

  /**
   * 启动应用程序。
   *
   * @param {number|string} port
   * @param {string} [hostname]
   * @param {Function} [callback] 可选回调函数
   * @returns {Promise} 一个 Promise，解析后是对底层 HttpServer 的引用。
   */
  listen(port: number | string, callback?: () => void): Promise<TServer>;
  listen(
    port: number | string,
    hostname: string,
    callback?: () => void,
  ): Promise<TServer>;

  /**
   * 原生 `express.set()` 方法的包装函数。
   *
   * @example
   * app.set('trust proxy', 'loopback')
   *
   * @returns {this}
   */
  set(...args: any[]): this;

  /**
   * 原生 `express.engine()` 方法的包装函数。
   * @example
   * app.engine('mustache', mustacheExpress())
   *
   * @returns {this}
   */
  engine(...args: any[]): this;

  /**
   * 原生 `express.enable()` 方法的包装函数。
   * @example
   * app.enable('x-powered-by')
   *
   * @returns {this}
   */
  enable(...args: any[]): this;

  /**
   * 原生 `express.disable()` 方法的包装函数。
   *
   * @example
   * app.disable('x-powered-by')
   *
   * @returns {this}
   */
  disable(...args: any[]): this;

  useStaticAssets(options: ServeStaticOptions): this;
  /**
   * 设置公共资源的基本目录。
   * @example
   * app.useStaticAssets('public')
   *
   * @returns {this}
   */
  useStaticAssets(path: string, options?: ServeStaticOptions): this;

  enableCors(options?: CorsOptions | CorsOptionsDelegate<any>): void;

  /**
   * 动态注册 Express body 解析器。将遵守应用程序的 `rawBody` 选项。
   *
   * @example
   * const app = await NestFactory.create<NestExpressApplication>(
   *   AppModule,
   *   { rawBody: true }
   * );
   * app.useBodyParser('json', { limit: '50mb' });
   *
   * @returns {this}
   */
  useBodyParser<Options = NestExpressBodyParserOptions>(
    parser: NestExpressBodyParserType,
    options?: Omit<Options, 'verify'>,
  ): this;

  /**
   * 为模板（视图）设置一个或多个基本目录。
   *
   * @example
   * app.setBaseViewsDir('views')
   *
   * @returns {this}
   */
  setBaseViewsDir(path: string | string[]): this;

  /**
   * 为模板（视图）设置视图引擎。
   * @example
   * app.setViewEngine('pug')
   *
   * @returns {this}
   */
  setViewEngine(engine: string): this;

  /**
   * 为视图模板设置应用程序级全局变量。
   *
   * @example
   * app.setLocal('title', 'My Site')
   *
   * @see https://expressjs.com/en/4x/api.html#app.locals
   *
   * @returns {this}
   */
  setLocal(key: string, value: any): this;
}
