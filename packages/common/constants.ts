/**
 * `@Module()` 装饰器使用的元数据键名。
 * Nest 在扫描模块时依据这些键读取模块的导入、提供者、控制器与导出配置。
 */
export const MODULE_METADATA = {
  IMPORTS: 'imports',
  PROVIDERS: 'providers',
  CONTROLLERS: 'controllers',
  EXPORTS: 'exports',
};

/** 标记动态模块是否为全局模块的元数据键名（由 `@Global()` 或 `global: true` 使用） */
export const GLOBAL_MODULE_METADATA = '__module:global__';
/** `@Controller()` 装饰器存储主机名（host）的元数据键名 */
export const HOST_METADATA = 'host';
/** `@Controller()` 与路由装饰器存储请求路径的元数据键名 */
export const PATH_METADATA = 'path';
/** TypeScript `emitDecoratorMetadata` 自动生成的构造函数参数类型元数据键名（用于构造函数依赖注入） */
export const PARAMTYPES_METADATA = 'design:paramtypes';
/** 通过 `@Inject()` 手动声明的构造函数依赖的元数据键名 */
export const SELF_DECLARED_DEPS_METADATA = 'self:paramtypes';
/** 声明可选构造函数依赖（`@Optional()`）的元数据键名 */
export const OPTIONAL_DEPS_METADATA = 'optional:paramtypes';
/** 声明属性注入（`@Inject()` 用于属性）的元数据键名 */
export const PROPERTY_DEPS_METADATA = 'self:properties_metadata';
/** 声明可选属性注入的元数据键名 */
export const OPTIONAL_PROPERTY_DEPS_METADATA = 'optional:properties_metadata';
/** 声明提供者作用域（`@Injectable({ scope })` 等）的元数据键名 */
export const SCOPE_OPTIONS_METADATA = 'scope:options';
/** 路由方法装饰器（`@Get()` 等）存储 HTTP 请求方法的元数据键名 */
export const METHOD_METADATA = 'method';
/** 存储路由处理方法参数（`@Body()`、`@Param()` 等）信息的元数据键名 */
export const ROUTE_ARGS_METADATA = '__routeArguments__';
/** 存储自定义路由参数装饰器信息的元数据键名 */
export const CUSTOM_ROUTE_ARGS_METADATA = '__customRouteArgs__';
/** `@UseFilters()` 与 `@Catch()` 存储异常过滤器相关信息的元数据键名 */
export const FILTER_CATCH_EXCEPTIONS = '__filterCatchExceptions__';

/** `@UsePipes()` 存储管道实例的元数据键名 */
export const PIPES_METADATA = '__pipes__';
/** `@UseGuards()` 存储守卫实例的元数据键名 */
export const GUARDS_METADATA = '__guards__';
/** `@UseInterceptors()` 存储拦截器实例的元数据键名 */
export const INTERCEPTORS_METADATA = '__interceptors__';
/** `@UseFilters()` 存储异常过滤器实例的元数据键名 */
export const EXCEPTION_FILTERS_METADATA = '__exceptionFilters__';

/**
 * 将各类增强器（enhancer）的元数据键名映射到其子类型标识，
 * 用于框架内部在运行时区分守卫、拦截器、管道与异常过滤器。
 */
export const ENHANCER_KEY_TO_SUBTYPE_MAP = {
  [GUARDS_METADATA]: 'guard',
  [INTERCEPTORS_METADATA]: 'interceptor',
  [PIPES_METADATA]: 'pipe',
  [EXCEPTION_FILTERS_METADATA]: 'filter',
} as const;

/**
 * 增强器的子类型联合类型，取值为 `'guard' | 'interceptor' | 'pipe' | 'filter'`。
 */
export type EnhancerSubtype =
  (typeof ENHANCER_KEY_TO_SUBTYPE_MAP)[keyof typeof ENHANCER_KEY_TO_SUBTYPE_MAP];

/** `@Render()` 装饰器存储模板名的元数据键名 */
export const RENDER_METADATA = '__renderTemplate__';
/** `@HttpCode()` 装饰器存储自定义 HTTP 状态码的元数据键名 */
export const HTTP_CODE_METADATA = '__httpCode__';
/** 存储模块路径（`module.path`，用于路由前缀）的元数据键名 */
export const MODULE_PATH = '__module_path__';
/** `@Header()` 装饰器存储自定义响应头的元数据键名 */
export const HEADERS_METADATA = '__headers__';
/** `@Redirect()` 装饰器存储重定向目标与状态码的元数据键名 */
export const REDIRECT_METADATA = '__redirect__';
/** 标记响应透传（`@Res({ passthrough: true })` 等）的元数据键名 */
export const RESPONSE_PASSTHROUGH_METADATA = '__responsePassthrough__';
/** `@Sse()` 装饰器标记服务端推送事件（SSE）路由的元数据键名 */
export const SSE_METADATA = '__sse__';
/** 版本控制相关（`@Version()` 等）存储路由版本的元数据键名 */
export const VERSION_METADATA = '__version__';
/** `@Injectable()` 装饰器在类上留下的水印（watermark），供框架扫描时识别可注入类 */
export const INJECTABLE_WATERMARK = '__injectable__';
/** `@Controller()` 装饰器在类上留下的水印，供框架扫描时识别控制器类 */
export const CONTROLLER_WATERMARK = '__controller__';
/** `@Catch()` 装饰器在异常过滤器类上留下的水印 */
export const CATCH_WATERMARK = '__catch__';
/** 标记入口提供者（如 GraphQL resolver 等）的水印 */
export const ENTRY_PROVIDER_WATERMARK = '__entryProvider__';
