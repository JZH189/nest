import { METHOD_METADATA, PATH_METADATA } from '../../constants';
import { RequestMethod } from '../../enums/request-method.enum';

export interface RequestMappingMetadata {
  path?: string | string[];
  method?: RequestMethod;
}

const defaultMetadata = {
  [PATH_METADATA]: '/',
  [METHOD_METADATA]: RequestMethod.GET,
};

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
