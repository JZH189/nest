type StaticOrigin = boolean | string | RegExp | (string | RegExp)[];

/**
 * 将 origin 设置为实现一些自定义逻辑的函数。该函数将请求 origin 作为第一个参数，
 * 回调函数（期望签名 err [object], allow [bool]）作为第二个参数。
 *
 * @see https://github.com/expressjs/cors
 *
 * @publicApi
 */
export type CustomOrigin = (
  requestOrigin: string | undefined,
  callback: (err: Error | null, origin?: StaticOrigin) => void,
) => void;

/**
 * 描述可设置的 CORS 选项的接口。
 *
 * @see https://github.com/expressjs/cors
 * @publicApi
 */
export interface CorsOptions {
  /**
   * 配置 `Access-Control-Allow-Origins` CORS 头。详见[此处](https://github.com/expressjs/cors#configuration-options)。
   */
  origin?: StaticOrigin | CustomOrigin;
  /**
   * 配置 Access-Control-Allow-Methods CORS 头。
   */
  methods?: string | string[];
  /**
   * 配置 Access-Control-Allow-Headers CORS 头。
   */
  allowedHeaders?: string | string[];
  /**
   * 配置 Access-Control-Expose-Headers CORS 头。
   */
  exposedHeaders?: string | string[];
  /**
   * 配置 Access-Control-Allow-Credentials CORS 头。
   */
  credentials?: boolean;
  /**
   * 配置 Access-Control-Max-Age CORS 头。
   */
  maxAge?: number;
  /**
   * 是否将 CORS 预检响应传递给下一个处理程序。
   */
  preflightContinue?: boolean;
  /**
   * 为成功的 OPTIONS 请求提供状态码。
   */
  optionsSuccessStatus?: number;
}

export interface CorsOptionsCallback {
  (error: Error | null, options: CorsOptions): void;
}
export interface CorsOptionsDelegate<T> {
  (req: T, cb: CorsOptionsCallback): void;
}
