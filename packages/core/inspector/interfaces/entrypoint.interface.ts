import { RequestMethod } from '@nestjs/common';
import { VersionValue } from '@nestjs/common/interfaces';

/**
 * HTTP 入口点元数据：描述一个 HTTP 路由处理器（controller 方法）的
 * 请求路径、HTTP 方法与版本信息。
 */
export type HttpEntrypointMetadata = {
  /** 路由路径。 */
  path: string;
  /** HTTP 请求方法名（GET、POST 等）。 */
  requestMethod: keyof typeof RequestMethod;
  /** 方法级路由版本。 */
  methodVersion?: VersionValue;
  /** Controller 级路由版本。 */
  controllerVersion?: VersionValue;
};

/**
 * 中间件入口点元数据：描述一个中间件挂载点的路径、HTTP 方法与版本。
 */
export type MiddlewareEntrypointMetadata = {
  /** 中间件挂载路径。 */
  path: string;
  /** HTTP 请求方法名。 */
  requestMethod: keyof typeof RequestMethod;
  /** 挂载点版本。 */
  version?: VersionValue;
};

/**
 * 入口点（Entrypoint）：依赖图中"应用请求入口"的统一抽象，
 * 通常对应 controller 处理器方法；由 GraphInspector 插入到其所属类节点下。
 *
 * @typeParam T - 具体入口点类型的元数据结构（如 HttpEntrypointMetadata）。
 */
export type Entrypoint<T> = {
  /** 入口点 id（格式为 classNodeId_methodName），可选。 */
  id?: string;
  /** 入口点类型（如 'http'、'middleware' 等）。 */
  type: string;
  /** 处理器方法名。 */
  methodName: string;
  /** 所属类名。 */
  className: string;
  /** 所属类节点 id。 */
  classNodeId: string;
  /** 入口点元数据，key 为方法名。 */
  metadata: { key: string } & T;
};
