import {
  CONTROLLER_WATERMARK,
  HOST_METADATA,
  PATH_METADATA,
  SCOPE_OPTIONS_METADATA,
  VERSION_METADATA,
} from '../../constants';
import { ScopeOptions, VersionOptions } from '../../interfaces';
import { isString, isUndefined } from '../../utils/shared.utils';

/**
 * 定义可传递给 `@Controller()` 装饰器的选项接口
 *
 * @publicApi
 */
export interface ControllerOptions extends ScopeOptions, VersionOptions {
  /**
   * 指定可选的 `路由路径前缀`。此前缀会添加到类中任何请求装饰器指定的路径前面。
   *
   * 仅由基于 HTTP 的应用程序支持（不适用于非 HTTP 微服务）。
   *
   * @see [路由](https://docs.nestjs.cn/controllers#routing)
   */
  path?: string | string[];

  /**
   * 指定可选的 HTTP 请求主机过滤器。配置后，
   * 只有当请求主机与指定值匹配时，控制器中的方法才会被路由。
   *
   * @see [路由](https://docs.nestjs.cn/controllers#routing)
   */
  host?: string | RegExp | Array<string | RegExp>;
}

/**
 * 将类标记为可以接收入站请求并生成响应的 Nest 控制器的装饰器。
 *
 * HTTP 控制器响应入站 HTTP 请求并生成 HTTP 响应。
 * 它定义了一个类，为一个或多个对应于 HTTP 请求方法和相关路由的路由处理程序提供上下文，
 * 例如 `GET /api/profile`、`POST /users/resume`。
 *
 * 微服务控制器响应请求以及事件，运行在多种传输上
 * [（了解更多）](https://docs.nestjs.cn/microservices/basics)。
 * 它定义了一个类，为一个或多个消息或事件处理程序提供上下文。
 *
 * @see [控制器](https://docs.nestjs.cn/controllers)
 * @see [微服务](https://docs.nestjs.cn/microservices/basics#request-response)
 *
 * @publicApi
 */
export function Controller(): ClassDecorator;

/**
 * 将类标记为可以接收入站请求并生成响应的 Nest 控制器的装饰器。
 *
 * HTTP 控制器响应入站 HTTP 请求并生成 HTTP 响应。
 * 它定义了一个类，为一个或多个对应于 HTTP 请求方法和相关路由的路由处理程序提供上下文，
 * 例如 `GET /api/profile`、`POST /users/resume`。
 *
 * 微服务控制器响应请求以及事件，运行在多种传输上
 * [（了解更多）](https://docs.nestjs.cn/microservices/basics)。
 * 它定义了一个类，为一个或多个消息或事件处理程序提供上下文。
 *
 * @param {string|Array} prefix 定义 `路由路径前缀` 的字符串。前缀将添加到类中任何请求装饰器指定的路径前面。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 * @see [控制器](https://docs.nestjs.cn/controllers)
 * @see [微服务](https://docs.nestjs.cn/microservices/basics#request-response)
 *
 * @publicApi
 */
export function Controller(prefix: string | string[]): ClassDecorator;

/**
 * 将类标记为可以接收入站请求并生成响应的 Nest 控制器的装饰器。
 *
 * HTTP 控制器响应入站 HTTP 请求并生成 HTTP 响应。
 * 它定义了一个类，为一个或多个对应于 HTTP 请求方法和相关路由的路由处理程序提供上下文，
 * 例如 `GET /api/profile`、`POST /users/resume`。
 *
 * 微服务控制器响应请求以及事件，运行在多种传输上
 * [（了解更多）](https://docs.nestjs.cn/microservices/basics)。
 * 它定义了一个类，为一个或多个消息或事件处理程序提供上下文。
 *
 * @param {object} options 指定以下内容的配置对象：
 *
 * - `scope` - 确定控制器实例生命周期的符号。
 * 有关更多详细信息，请参见[作用域](https://docs.nestjs.cn/fundamentals/injection-scopes#usage)。
 * - `prefix` - 定义 `路由路径前缀` 的字符串。前缀将添加到类中任何请求装饰器指定的路径前面。
 * - `version` - 定义类中所有路由版本的字符串、字符串数组或符号。
 * 有关更多详细信息，请参见[版本控制](https://docs.nestjs.cn/techniques/versioning)。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 * @see [控制器](https://docs.nestjs.cn/controllers)
 * @see [微服务](https://docs.nestjs.cn/microservices/basics#request-response)
 * @see [版本控制](https://docs.nestjs.cn/techniques/versioning)
 *
 * @publicApi
 */
export function Controller(options: ControllerOptions): ClassDecorator;

/**
 * 将类标记为可以接收入站请求并生成响应的 Nest 控制器的装饰器。
 *
 * HTTP 控制器响应入站 HTTP 请求并生成 HTTP 响应。
 * 它定义了一个类，为一个或多个对应于 HTTP 请求方法和相关路由的路由处理程序提供上下文，
 * 例如 `GET /api/profile`、`POST /users/resume`。
 *
 * 微服务控制器响应请求以及事件，运行在多种传输上
 * [（了解更多）](https://docs.nestjs.cn/microservices/basics)。
 * 它定义了一个类，为一个或多个消息或事件处理程序提供上下文。
 *
 * @param prefixOrOptions `路由路径前缀` 或 `ControllerOptions` 对象。
 * `路由路径前缀` 将添加到类中任何请求装饰器指定的路径前面。
 * `ControllerOptions` 是指定以下内容的选项配置对象：
 * - `scope` - 确定控制器实例生命周期的符号。
 * 有关更多详细信息，请参见[作用域](https://docs.nestjs.cn/fundamentals/injection-scopes#usage)。
 * - `prefix` - 定义 `路由路径前缀` 的字符串。前缀将添加到类中任何请求装饰器指定的路径前面。
 * - `version` - 定义类中所有路由版本的字符串、字符串数组或符号。
 * 有关更多详细信息，请参见[版本控制](https://docs.nestjs.cn/techniques/versioning)。
 *
 * @see [路由](https://docs.nestjs.cn/controllers#routing)
 * @see [控制器](https://docs.nestjs.cn/controllers)
 * @see [微服务](https://docs.nestjs.cn/microservices/basics#request-response)
 * @see [作用域](https://docs.nestjs.cn/fundamentals/injection-scopes#usage)
 * @see [版本控制](https://docs.nestjs.cn/techniques/versioning)
 *
 * @publicApi
 */
export function Controller(
  prefixOrOptions?: string | string[] | ControllerOptions,
): ClassDecorator {
  const defaultPath = '/';

  const [path, host, scopeOptions, versionOptions] = isUndefined(
    prefixOrOptions,
  )
    ? [defaultPath, undefined, undefined, undefined]
    : isString(prefixOrOptions) || Array.isArray(prefixOrOptions)
      ? [prefixOrOptions, undefined, undefined, undefined]
      : [
          prefixOrOptions.path || defaultPath,
          prefixOrOptions.host,
          { scope: prefixOrOptions.scope, durable: prefixOrOptions.durable },
          Array.isArray(prefixOrOptions.version)
            ? Array.from(new Set(prefixOrOptions.version))
            : prefixOrOptions.version,
        ];

  return (target: object) => {
    Reflect.defineMetadata(CONTROLLER_WATERMARK, true, target);
    Reflect.defineMetadata(PATH_METADATA, path, target);
    Reflect.defineMetadata(HOST_METADATA, host, target);
    Reflect.defineMetadata(SCOPE_OPTIONS_METADATA, scopeOptions, target);
    Reflect.defineMetadata(VERSION_METADATA, versionOptions, target);
  };
}
