import { VersioningType } from '../enums/version-type.enum';

/**
 * 表示此配置将适用于请求中传递的任何版本或不传递版本。
 *
 * @publicApi
 */
export const VERSION_NEUTRAL = Symbol('VERSION_NEUTRAL');

/**
 * @publicApi
 */
export type VersionValue =
  | string
  | typeof VERSION_NEUTRAL
  | Array<string | typeof VERSION_NEUTRAL>;

/**
 * @publicApi
 */
export interface VersionOptions {
  /**
   * 指定可选的 API 版本。配置后，只有当请求版本与指定值匹配时，
   * 控制器内的方法才会被路由。
   *
   * 仅由基于 HTTP 的应用程序支持(不适用于非 HTTP 微服务)。
   *
   * @see [版本控制](https://docs.nestjs.cn/techniques/versioning)
   */
  version?: VersionValue;
}

/**
 * @publicApi
 */
export interface HeaderVersioningOptions {
  type: VersioningType.HEADER;
  /**
   * 包含版本的请求头的名称。
   */
  header: string;
}

/**
 * @publicApi
 */
export interface UriVersioningOptions {
  type: VersioningType.URI;
  /**
   * 将预置在 URI 中的版本前缀。
   *
   * 默认为 `v`。
   *
   * 例如。假设版本为 `1`，对于 `/api/v1/route`，`v` 是前缀。
   */
  prefix?: string | false;
}

/**
 * @publicApi
 */
export interface MediaTypeVersioningOptions {
  type: VersioningType.MEDIA_TYPE;
  /**
   * Media Type Header 中用于确定版本的键。
   *
   * 例如。对于 `application/json;v=1`，键是 `v=`。
   */
  key: string;
}

/**
 * @publicApi
 */
export interface CustomVersioningOptions {
  type: VersioningType.CUSTOM;

  /**
   * 一个接受请求对象的函数(特定于底层平台，即 Express 或 Fastify)，
   * 并返回单个版本值或有序版本数组，按从高到低的顺序排列。
   *
   * 例如。返回的版本数组 = ['3.1', '3.0', '2.5', '2', '1.9']
   *
   * 使用类型断言或类型收窄来识别特定的请求类型。
   */
  extractor: (request: unknown) => string | string[];
}

/**
 * @publicApi
 */
interface VersioningCommonOptions {
  /**
   * 当你没有向 `@Controller()` 或 `@Version()` 提供某些版本时，
   * 用作回退的默认版本。
   */
  defaultVersion?: VersionOptions['version'];
}

/**
 * @publicApi
 */
export type VersioningOptions = VersioningCommonOptions &
  (
    | HeaderVersioningOptions
    | UriVersioningOptions
    | MediaTypeVersioningOptions
    | CustomVersioningOptions
  );
