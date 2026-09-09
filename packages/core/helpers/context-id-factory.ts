import { isObject } from '@nestjs/common/utils/shared.utils';
import { ContextId, HostComponentInfo } from '../injector/instance-wrapper';
import { REQUEST_CONTEXT_ID } from '../router/request/request-constants';

/**
 * 创建一个新的请求上下文 ID 对象。
 *
 * 在框架中的角色：每个请求级作用域的解析都依赖 ContextId 来标识“当前请求”。
 * @returns 包含随机 id 的 ContextId 对象
 */
export function createContextId(): ContextId {
  /**
   * We are generating random identifier to track asynchronous
   * execution context. An identifier does not have to be neither unique
   * nor unpredictable because WeakMap uses objects as keys (reference comparison).
   * Thus, even though identifier number might be equal, WeakMap would properly
   * associate asynchronous context with its internal map values using object reference.
   * Object is automatically removed once request has been processed (closure).
   */
  return { id: Math.random() };
}

/**
 * 上下文 ID 解析函数类型：根据宿主组件信息（token、是否 durable）返回父级上下文 ID。
 */
export type ContextIdResolverFn = (info: HostComponentInfo) => ContextId;

/**
 * 带负载的上下文 ID 解析器：除解析函数外，还可携带随请求传递的 payload。
 */
export interface ContextIdResolver {
  /**
   * Payload associated with the custom context id
   */
  payload: unknown;
  /**
   * A context id resolver function
   */
  resolve: ContextIdResolverFn;
}

/**
 * 自定义上下文 ID 策略接口：允许用户把父级上下文 ID 附加到子上下文上，
 * 用于构建可在多个请求上下文之间共享的 durable（持久）DI 子树。
 */
export interface ContextIdStrategy<T = any> {
  /**
   * Allows to attach a parent context id to the existing child context id.
   * This lets you construct durable DI sub-trees that can be shared between contexts.
   * @param contextId auto-generated child context id
   * @param request request object
   */
  attach(
    contextId: ContextId,
    request: T,
  ): ContextIdResolverFn | ContextIdResolver | undefined;
}

/**
 * 上下文 ID 工厂：统一负责请求上下文 ID 的创建与解析策略。
 *
 * 在框架中的角色：请求级作用域（Scope.REQUEST）实例的解析、
 * ExecutionContext 的创建等都会调用本工厂获取/复用 ContextId。
 */
export class ContextIdFactory {
  private static strategy?: ContextIdStrategy;

  /**
   * Generates a context identifier based on the request object.
   */
  public static create(): ContextId {
    return createContextId();
  }

  /**
   * 从请求对象中获取（或生成）上下文 ID。
   * @param request - 请求对象（HTTP/WS/RPC 载荷均可）
   * @param propsToInspect - 需要额外检查的请求属性名（如 Fastify 的 raw），默认 ['raw']
   * @returns 已缓存的或新生成的 ContextId；应用了自定义策略时会挂载 getParent 解析器
   */
  public static getByRequest<T extends Record<any, any> = any>(
    request: T,
    propsToInspect: string[] = ['raw'],
  ): ContextId {
    if (!request) {
      return ContextIdFactory.create();
    }
    // 请求对象上已缓存上下文 ID 则直接复用
    if (request[REQUEST_CONTEXT_ID as any]) {
      return request[REQUEST_CONTEXT_ID as any];
    }
    // 检查指定属性（如底层框架的原始请求对象）上的缓存
    for (const key of propsToInspect) {
      if (request[key]?.[REQUEST_CONTEXT_ID]) {
        return request[key][REQUEST_CONTEXT_ID];
      }
    }
    if (!this.strategy) {
      return ContextIdFactory.create();
    }
    // 应用自定义策略：把父级上下文 ID 的解析逻辑附加到新上下文上
    const contextId = createContextId();
    const resolverObjectOrFunction = this.strategy.attach(contextId, request);
    if (this.isContextIdResolverWithPayload(resolverObjectOrFunction!)) {
      contextId.getParent = resolverObjectOrFunction.resolve;
      contextId.payload = resolverObjectOrFunction.payload;
    } else {
      contextId.getParent = resolverObjectOrFunction;
    }
    return contextId;
  }

  /**
   * Registers a custom context id strategy that lets you attach
   * a parent context id to the existing context id object.
   * @param strategy strategy instance
   */
  public static apply(strategy: ContextIdStrategy) {
    this.strategy = strategy;
  }

  /**
   * 判断解析器是否是带 payload 的 ContextIdResolver 对象（而非纯函数）。
   * @param resolverOrResolverFn - 解析器对象或解析函数
   * @returns 若为带 payload 的解析器对象则返回 true
   */
  private static isContextIdResolverWithPayload(
    resolverOrResolverFn: ContextIdResolver | ContextIdResolverFn,
  ): resolverOrResolverFn is ContextIdResolver {
    return isObject(resolverOrResolverFn);
  }
}
