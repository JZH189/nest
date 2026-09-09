/**
 * @fastify/view（point-of-view）服务端渲染插件的配置选项，
 * 供 NestFastifyApplication.setViewEngine() 使用：
 * - engine：指定模板引擎及其配置（pug、ejs、handlebars 等）；
 * - templates/root：模板文件所在目录；
 * - options/production/maxCache：渲染与缓存行为。
 *
 * @see https://github.com/fastify/point-of-view/blob/master/types/index.d.ts
 * @publicApi
 */
export interface FastifyViewOptions {
  /** 模板引擎注册表：键为引擎名，值为 require 进来的引擎模块（至少配置一个） */
  engine: {
    ejs?: any;
    eta?: any;
    nunjucks?: any;
    pug?: any;
    handlebars?: any;
    mustache?: any;
    'art-template'?: any;
    twig?: any;
    liquid?: any;
    dot?: any;
  };
  /** 模板文件所在目录（兼容旧版 root 的别名） */
  templates?: string | string[];
  /** 渲染时是否自动为视图名追加模板扩展名 */
  includeViewExtension?: boolean;
  /** 传给模板引擎实例的初始化选项 */
  options?: object;
  /** 模板编码，默认 utf8 */
  charset?: string;
  /** 已解析模板的最大缓存数量（LRU 缓存上限） */
  maxCache?: number;
  /** 是否启用生产模式（开启模板缓存） */
  production?: boolean;
  /** 每次渲染都会合并的默认上下文数据 */
  defaultContext?: object;
  /** 布局模板文件路径（配合引擎的布局能力使用） */
  layout?: string;
  /** 模板文件所在目录 */
  root?: string;
  /** 默认的模板文件扩展名 */
  viewExt?: string;
  /** reply 上挂载的渲染方法名（默认 view） */
  propertyName?: string;
  /** reply 上挂载的异步渲染方法名（默认 viewAsync） */
  asyncProperyName?: string;
}
