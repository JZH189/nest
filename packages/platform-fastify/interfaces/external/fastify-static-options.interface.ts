/**
 * @fastify/static 静态资源插件所需的接口定义（本地镜像，避免引入额外类型包）。
 *
 * @see https://github.com/fastify/fastify-static/blob/master/types/index.d.ts
 * @publicApi
 */
import { RouteOptions, FastifyRequest, FastifyReply } from 'fastify';
import { Stats } from 'fs';

interface SetHeadersResponse {
  getHeader: FastifyReply['getHeader'];
  setHeader: FastifyReply['header'];
  readonly filename: string;
  statusCode: number;
}

interface ExtendedInformation {
  fileCount: number;
  totalFileCount: number;
  folderCount: number;
  totalFolderCount: number;
  totalSize: number;
  lastModified: number;
}

interface ListDir {
  href: string;
  name: string;
  stats: Stats;
  extendedInfo?: ExtendedInformation;
}

interface ListFile {
  href: string;
  name: string;
  stats: Stats;
}

/** 目录列表渲染函数：接收目录与文件信息，返回渲染后的 HTML 字符串 */
interface ListRender {
  (dirs: ListDir[], files: ListFile[]): string;
}

/** 目录列表（list）功能的公共选项 */
interface ListOptions {
  names: string[];
  extendedFolderInfo?: boolean;
  jsonFormat?: 'names' | 'extended';
}

/** list 选项的 JSON 输出格式（format='json' 时 render 可选） */
export interface ListOptionsJsonFormat extends ListOptions {
  format: 'json';
  // Required when the URL parameter `format=html` exists
  render?: ListRender;
}

/** list 选项的 HTML 输出格式（format='html' 时 render 必填） */
export interface ListOptionsHtmlFormat extends ListOptions {
  format: 'html';
  render: ListRender;
}

// Passed on to `send`
/** 透传给底层 send 库的缓存/文件服务选项 */
interface SendOptions {
  acceptRanges?: boolean;
  cacheControl?: boolean;
  dotfiles?: 'allow' | 'deny' | 'ignore';
  etag?: boolean;
  extensions?: string[];
  immutable?: boolean;
  index?: string[] | string | false;
  lastModified?: boolean;
  maxAge?: string | number;
  serveDotFiles?: boolean;
}

/**
 * @fastify/static 插件的配置选项，供 NestFastifyApplication.useStaticAssets() 使用。
 * 必填 root 指定静态资源根目录；其余选项控制 URL 前缀、通配符路由、
 * 目录列表（list）、预压缩文件（preCompressed），以及透传给 send 的缓存策略。
 */
export interface FastifyStaticOptions extends SendOptions {
  /** 静态资源根目录（必填），可为目录或目录数组 */
  root: string | string[] | URL | URL[];
  /** URL 路径前缀（虚拟挂载路径），默认 '/' */
  prefix?: string;
  /** 避免对带结尾斜杠的前缀进行重定向处理 */
  prefixAvoidTrailingSlash?: boolean;
  /** 是否实际对外提供文件服务（false 时仅注册路由不做装饰） */
  serve?: boolean;
  /** 是否向响应对象装饰 sendFile 等方法 */
  decorateReply?: boolean;
  /** 是否在路由的 schema 中隐藏该路由（对 Swagger 等工具生效） */
  schemaHide?: boolean;
  /** 自定义响应头设置函数 */
  setHeaders?: (res: SetHeadersResponse, path: string, stat: Stats) => void;
  /** 访问目录时是否重定向到结尾斜杠的 URL */
  redirect?: boolean;
  /** 是否启用通配符路由（默认 true，支持匹配子路径中的文件） */
  wildcard?: boolean;
  /** 目录列表功能：false 关闭，或指定 JSON/HTML 输出格式与渲染函数 */
  list?: boolean | ListOptionsJsonFormat | ListOptionsHtmlFormat;
  /** 自定义路径校验函数，返回 false 时拒绝该请求路径 */
  allowedPath?: (
    pathName: string,
    root: string,
    request: FastifyRequest,
  ) => boolean;
  /**
   * @description
   * Opt-in to looking for pre-compressed files
   */
  preCompressed?: boolean;

  // Passed on to `send`
  acceptRanges?: boolean;
  cacheControl?: boolean;
  dotfiles?: 'allow' | 'deny' | 'ignore';
  etag?: boolean;
  extensions?: string[];
  immutable?: boolean;
  index?: string[] | string | false;
  lastModified?: boolean;
  maxAge?: string | number;
  constraints?: RouteOptions['constraints'];
}
