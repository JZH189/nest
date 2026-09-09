import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import {
  VersionValue,
  VERSION_NEUTRAL,
} from '@nestjs/common/interfaces/version-options.interface';

/**
 * 模块依赖初始化完成的日志消息（标签模板函数）。
 * @param text - 模板字符串字面量
 * @param module - 模块名
 * @returns 形如 “XxxModule dependencies initialized” 的消息
 */
export const MODULE_INIT_MESSAGE = (
  text: TemplateStringsArray,
  module: string,
) => `${module} dependencies initialized`;

/**
 * 路由映射完成的日志消息。
 * @param path - 路由路径
 * @param method - HTTP 方法
 * @returns 形如 “Mapped {/cats, GET} route” 的消息
 */
export const ROUTE_MAPPED_MESSAGE = (path: string, method: string | number) =>
  `Mapped {${path}, ${RequestMethod[method]}} route`;

/**
 * 带版本号的路由映射日志消息。
 * @param path - 路由路径
 * @param method - HTTP 方法
 * @param version - 路由版本（可为数组或 VERSION_NEUTRAL）
 * @returns 形如 “Mapped {/cats, GET} (version: 1) route” 的消息
 */
export const VERSIONED_ROUTE_MAPPED_MESSAGE = (
  path: string,
  method: string | number,
  version: VersionValue,
) => {
  const controllerVersions = Array.isArray(version) ? version : [version];
  const versions = controllerVersions
    .map(version => (version === VERSION_NEUTRAL ? 'Neutral' : version))
    .join(',');

  return `Mapped {${path}, ${RequestMethod[method]}} (version: ${versions}) route`;
};

/**
 * 控制器映射开始的日志消息（后续路由日志归属于该控制器）。
 * @param name - 控制器名
 * @param path - 控制器路径前缀
 * @returns 形如 “CatsController {/cats}:” 的消息
 */
export const CONTROLLER_MAPPING_MESSAGE = (name: string, path: string) =>
  `${name} {${path}}:`;

/**
 * 带版本号的控制器映射日志消息。
 * @param name - 控制器名
 * @param path - 控制器路径前缀
 * @param version - 控制器版本（可为数组或 VERSION_NEUTRAL）
 * @returns 形如 “CatsController {/cats} (version: 1):” 的消息
 */
export const VERSIONED_CONTROLLER_MAPPING_MESSAGE = (
  name: string,
  path: string,
  version: VersionValue,
) => {
  const controllerVersions = Array.isArray(version) ? version : [version];
  const versions = controllerVersions
    .map(version => (version === VERSION_NEUTRAL ? 'Neutral' : version))
    .join(',');

  return `${name} {${path}} (version: ${versions}):`;
};

/**
 * 非法执行上下文的警告消息：在不允许的上下文中调用某方法时提示。
 * @param methodName - 被调用的方法名
 * @param currentContext - 当前的执行上下文名
 * @returns 形如 “Calling xxx is not allowed in this context...” 的消息
 */
export const INVALID_EXECUTION_CONTEXT = (
  methodName: string,
  currentContext: string,
) =>
  `Calling ${methodName} is not allowed in this context. Your current execution context is "${currentContext}".`;
