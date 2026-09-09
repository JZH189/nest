/**
 * URI 版本控制的版本类型枚举。
 *
 * 通过 `app.enableVersioning({ type: VersioningType.XXX })` 选择版本策略，
 * 决定 `@Version()` 装饰器与全局版本前缀如何匹配请求。
 *
 * @publicApi
 */
export enum VersioningType {
  URI, // URI 路径版本：如 /api/v1/cats
  HEADER, // 自定义请求头版本：如 X-API-Version: 1
  MEDIA_TYPE, // Accept 头媒体类型版本：如 application/vnd.myapp.v1+json
  CUSTOM, // 自定义提取器版本：由 extractor 函数从请求中提取版本
}
