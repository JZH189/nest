import { Controller, Type } from '@nestjs/common/interfaces';
import { IncomingMessage } from 'http';
import { Observable } from 'rxjs';
import { CONTROLLER_ID_KEY } from '../injector/constants';
import { ContextId } from '../injector/instance-wrapper';
import { HeaderStream } from '../router/sse-stream';
import { ParamProperties } from './context-utils';

/**
 * 处理器元数据缓存的全局 Symbol 键：同一符号在不同模块实例间共享，
 * 保证缓存全局唯一。
 */
export const HANDLER_METADATA_SYMBOL = Symbol.for('handler_metadata:cache');

/**
 * 响应处理函数类型：基础响应处理函数或 SSE 响应处理函数的联合类型。
 */
export type HandleResponseFn = HandlerResponseBasicFn | HandleSseResponseFn;

/**
 * 基础响应处理函数类型：把处理器返回值写入响应对象。
 */
export type HandlerResponseBasicFn = <TResult, TResponse>(
  result: TResult,
  res: TResponse,
  req?: any,
) => any;

/**
 * SSE 响应处理函数类型：把 Observable 结果以 Server-Sent Events
 * 流的形式写入响应。
 */
export type HandleSseResponseFn = <
  TResult extends Observable<unknown> = any,
  TResponse extends HeaderStream = any,
  TRequest extends IncomingMessage = any,
>(
  result: TResult,
  res: TResponse,
  req: TRequest,
) => any;

/**
 * 路由处理器元数据：路由工厂在启动阶段编译并缓存，请求期直接复用，
 * 避免每次请求重复反射。
 */
export interface HandlerMetadata {
  /** 参数槽位总长度 */
  argsLength: number;
  /** 参数类型元数据数组 */
  paramtypes: any[];
  /** 处理器声明的 HTTP 状态码 */
  httpStatusCode: number;
  /** 通过 @Header() 声明的响应头列表 */
  responseHeaders: any[];
  /** 是否声明了自定义响应头 */
  hasCustomHeaders: boolean;
  /** 按模块/上下文解析参数元数据的延迟提取函数 */
  getParamsMetadata: (
    moduleKey: string,
    contextId?: ContextId,
    inquirerId?: string,
  ) => (ParamProperties & { metatype?: any })[];
  /** 响应处理函数（把返回值写入响应） */
  fnHandleResponse: HandleResponseFn;
}

/**
 * 处理器元数据存储：按“控制器 + 方法名”缓存编译后的元数据。
 *
 * 在框架中的角色：路由代理与 ExternalContextCreator 都使用它做反射
 * 结果缓存，Map 的 key 由控制器 ID（CONTROLLER_ID_KEY，找不到时退化为
 * 类名）与方法名拼接而成。
 */
export class HandlerMetadataStorage<
  TValue = HandlerMetadata,
  TKey extends Type<unknown> = any,
> {
  private readonly [HANDLER_METADATA_SYMBOL] = new Map<string, TValue>();

  /**
   * 写入指定控制器方法的元数据缓存。
   * @param controller - 控制器类
   * @param methodName - 方法名
   * @param metadata - 要缓存的元数据
   */
  set(controller: TKey, methodName: string, metadata: TValue) {
    const metadataKey = this.getMetadataKey(controller, methodName);
    this[HANDLER_METADATA_SYMBOL].set(metadataKey, metadata);
  }

  /**
   * 读取指定控制器方法的元数据缓存。
   * @param controller - 控制器类
   * @param methodName - 方法名
   * @returns 缓存的元数据；未命中时返回 undefined
   */
  get(controller: TKey, methodName: string): TValue | undefined {
    const metadataKey = this.getMetadataKey(controller, methodName);
    return this[HANDLER_METADATA_SYMBOL].get(metadataKey);
  }

  /**
   * 拼接缓存键：控制器 ID（或类名）+ 方法名。
   * @param controller - 控制器类
   * @param methodName - 方法名
   * @returns 缓存键字符串
   */
  private getMetadataKey(controller: Controller, methodName: string): string {
    const ctor = controller.constructor;
    const controllerKey = ctor && (ctor[CONTROLLER_ID_KEY] || ctor.name);
    return controllerKey + methodName;
  }
}
