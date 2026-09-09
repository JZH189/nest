/**
 * HTTP 请求方法枚举。
 *
 * `@RequestMapping()` 与 `@Get()`、`@Post()` 等方法装饰器会将其写入
 * `METHOD_METADATA` 元数据，路由扫描时据此把路由注册为对应的方法处理器。
 * 注意成员值为从 0 开始的序号（而非数字化的 HTTP 码），其中
 * PROPFIND 之后为 WebDAV 方法。
 */
export enum RequestMethod {
  GET = 0, // HTTP GET 请求
  POST, // HTTP POST 请求
  PUT, // HTTP PUT 请求
  DELETE, // HTTP DELETE 请求
  PATCH, // HTTP PATCH 请求
  ALL, // 匹配所有 HTTP 方法
  OPTIONS, // HTTP OPTIONS 请求
  HEAD, // HTTP HEAD 请求
  SEARCH, // HTTP SEARCH 请求
  PROPFIND, // WebDAV PROPFIND 请求
  PROPPATCH, // WebDAV PROPPATCH 请求
  MKCOL, // WebDAV MKCOL 请求
  COPY, // WebDAV COPY 请求
  MOVE, // WebDAV MOVE 请求
  LOCK, // WebDAV LOCK 请求
  UNLOCK, // WebDAV UNLOCK 请求
}
