import {
  CorsOptions,
  CorsOptionsDelegate,
} from './external/cors-options.interface';
import { HttpsOptions } from './external/https-options.interface';
import { NestApplicationContextOptions } from './nest-application-context-options.interface';

/**
 * @publicApi
 */
export interface NestApplicationOptions extends NestApplicationContextOptions {
  /**
   * 来自 [CORS 包](https://github.com/expressjs/cors#configuration-options) 的 CORS 选项
   */
  cors?: boolean | CorsOptions | CorsOptionsDelegate<any>;
  /**
   * 是否使用底层平台的身体解析器。
   */
  bodyParser?: boolean;
  /**
   * 可配置的 HTTPS 选项集
   */
  httpsOptions?: HttpsOptions;
  /**
   * 是否在请求上注册原始请求体。使用 `req.rawBody`。
   */
  rawBody?: boolean;
  /**
   * 强制关闭打开的 HTTP 连接。如果由于 HTTP 适配器中的 keep-alive 连接导致重启应用程序挂起，则此选项很有用。
   */
  forceCloseConnections?: boolean;
}
