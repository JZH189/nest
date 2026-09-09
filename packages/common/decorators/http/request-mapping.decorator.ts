import { METHOD_METADATA, PATH_METADATA } from '../../constants';
import { RequestMethod } from '../../enums/request-method.enum';

/**
 * 请求映射元数据的配置对象：可指定路由路径（path）与 HTTP 请求方法（method）。
 * `@RequestMapping()` 及所有 HTTP 方法装饰器（`@Get`、`@Post` 等）均基于它构建。
 */
export interface RequestMappingMetadata {
  path?: string | string[];
  method?: RequestMethod;
}

// 默认元数据：路径为根路径 '/'，请求方法为 GET
const defaultMetadata = {
  [PATH_METADATA]: '/',
  [METHOD_METADATA]: RequestMethod.GET,
};

/**
 * 请求方法装饰器。将请求按指定的 HTTP 方法与路径映射到路由处理程序，
 * 是 `@Get()`、`@Post()` 等所有 HTTP 方法装饰器的底层实现。
 *
 * 运行时将 `PATH_METADATA`（路径）与 `METHOD_METADATA`（请求方法）
 * 写入方法函数的元数据，供路由扫描（RoutesResolver）读取并注册到 HTTP 适配器。
 *
 * @param metadata - 包含 `path` 与 `method` 的配置对象，缺省为 `'/'` + `GET`
 * @returns 方法装饰器
 */
export const RequestMapping = (
  metadata: RequestMappingMetadata = defaultMetadata,
): MethodDecorator => {
  const pathMetadata = metadata[PATH_METADATA];
  const path = pathMetadata && pathMetadata.length ? pathMetadata : '/';
  const requestMethod = metadata[METHOD_METADATA] || RequestMethod.GET;

  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    Reflect.defineMetadata(PATH_METADATA, path, descriptor.value);
    Reflect.defineMetadata(METHOD_METADATA, requestMethod, descriptor.value);
    return descriptor;
  };
};

/**
 * 装饰器工厂的工厂：接收一个 HTTP 请求方法，返回一个接收路径的装饰器工厂。
 * 以此批量派生出 `@Get`、`@Post` 等所有方法装饰器，避免重复代码。
 *
 * @param method - 该装饰器绑定的 HTTP 请求方法
 */
const createMappingDecorator =
  (method: RequestMethod) =>
  (path?: string | string[]): MethodDecorator => {
    return RequestMapping({
      [PATH_METADATA]: path,
      [METHOD_METADATA]: method,
    });
  };

/**
 * 路由处理程序(方法)装饰器。将 HTTP POST 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Post = createMappingDecorator(RequestMethod.POST);

/**
 * 路由处理程序(方法)装饰器。将 HTTP GET 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Get = createMappingDecorator(RequestMethod.GET);

/**
 * 路由处理程序(方法)装饰器。将 HTTP DELETE 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Delete = createMappingDecorator(RequestMethod.DELETE);

/**
 * 路由处理程序(方法)装饰器。将 HTTP PUT 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Put = createMappingDecorator(RequestMethod.PUT);

/**
 * 路由处理程序(方法)装饰器。将 HTTP PATCH 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Patch = createMappingDecorator(RequestMethod.PATCH);

/**
 * 路由处理程序(方法)装饰器。将 HTTP OPTIONS 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Options = createMappingDecorator(RequestMethod.OPTIONS);

/**
 * 路由处理程序(方法)装饰器。将 HTTP HEAD 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Head = createMappingDecorator(RequestMethod.HEAD);

/**
 * 路由处理程序(方法)装饰器。将所有 HTTP 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const All = createMappingDecorator(RequestMethod.ALL);

/**
 * 路由处理程序(方法)装饰器。将 HTTP SEARCH 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Search = createMappingDecorator(RequestMethod.SEARCH);

/**
 * 路由处理程序(方法)装饰器。将 Webdav PROPFIND 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Propfind = createMappingDecorator(RequestMethod.PROPFIND);

/**
 * 路由处理程序(方法)装饰器。将 Webdav PROPPATCH 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Proppatch = createMappingDecorator(RequestMethod.PROPPATCH);

/**
 * 路由处理程序(方法)装饰器。将 Webdav MKCOL 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Mkcol = createMappingDecorator(RequestMethod.MKCOL);

/**
 * 路由处理程序(方法)装饰器。将 Webdav COPY 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Copy = createMappingDecorator(RequestMethod.COPY);

/**
 * 路由处理程序(方法)装饰器。将 Webdav MOVE 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Move = createMappingDecorator(RequestMethod.MOVE);

/**
 * 路由处理程序(方法)装饰器。将 Webdav LOCK 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Lock = createMappingDecorator(RequestMethod.LOCK);

/**
 * 路由处理程序(方法)装饰器。将 Webdav UNLOCK 请求路由到指定路径。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 *
 * @publicApi
 */
export const Unlock = createMappingDecorator(RequestMethod.UNLOCK);
