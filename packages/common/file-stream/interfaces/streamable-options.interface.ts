/**
 * `StreamableFile` 的选项
 *
 * @see [流式文件](https://docs.nestjs.cn/techniques/streaming-files)
 *
 * @publicApi
 */
export interface StreamableFileOptions {
  /**
   * 将用于 `Content-Type` 响应头的值。
   * @default `"application/octet-stream"`
   */
  type?: string;
  /**
   * 将用于 `Content-Disposition` 响应头的值。
   */
  disposition?: string | string[];
  /**
   * 将用于 `Content-Length` 响应头的值。
   */
  length?: number;
}
