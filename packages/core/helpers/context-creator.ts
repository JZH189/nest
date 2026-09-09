import { Controller } from '@nestjs/common/interfaces';
import { STATIC_CONTEXT } from '../injector/constants';
import { ContextId, InstanceWrapper } from '../injector/instance-wrapper';

/**
 * 上下文创建器抽象基类，是异常过滤器、守卫、拦截器三套机制共享的
 * “元数据收集 → 具体上下文编译”模板。
 *
 * 在框架中的角色：GuardsContextCreator、ExceptionsHandler 体系中的
 * BaseExceptionFilterContext、InterceptorContextCreator 等都继承本类，
 * 通过 createContext() 按“全局 → 类级 → 方法级”的顺序合并装饰器元数据，
 * 再由子类实现的 createConcreteContext() 把元数据编译成可执行上下文。
 */
export abstract class ContextCreator {
  /**
   * 将收集到的元数据编译为具体上下文（由子类实现各自的编译逻辑）。
   * @param metadata - 通过装饰器收集到的元数据数组
   * @param contextId - 请求上下文 ID（请求级作用域用）
   * @param inquirerId - 请求发起者 ID（瞬态作用域用）
   * @returns 编译后的可执行上下文数组
   */
  public abstract createConcreteContext<T extends any[], R extends any[]>(
    metadata: T,
    contextId?: ContextId,
    inquirerId?: string,
  ): R;
  /**
   * 可选的全局元数据获取钩子（由子类按需实现，如全局守卫/全局过滤器）。
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 请求发起者 ID
   * @returns 全局元数据数组
   */
  public getGlobalMetadata?<T extends any[]>(
    contextId?: ContextId,
    inquirerId?: string,
  ): T;

  /**
   * 模板方法：按“全局 → 类 → 方法”顺序收集并编译元数据，合并为最终上下文。
   * @param instance - 控制器实例
   * @param callback - 路由处理方法
   * @param metadataKey - 元数据键（如 GUARDS_METADATA、EXCEPTION_FILTERS_METADATA）
   * @param contextId - 请求上下文 ID，默认为静态上下文
   * @param inquirerId - 请求发起者 ID
   * @returns 合并后的可执行上下文数组
   */
  public createContext<T extends unknown[] = any, R extends unknown[] = any>(
    instance: Controller,
    callback: (...args: any[]) => void,
    metadataKey: string,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): R {
    const globalMetadata =
      this.getGlobalMetadata &&
      this.getGlobalMetadata<T>(contextId, inquirerId);
    const classMetadata = this.reflectClassMetadata<T>(instance, metadataKey);
    const methodMetadata = this.reflectMethodMetadata<T>(callback, metadataKey);
    return [
      ...this.createConcreteContext<T, R>(
        globalMetadata || ([] as unknown[] as T),
        contextId,
        inquirerId,
      ),
      ...this.createConcreteContext<T, R>(classMetadata, contextId, inquirerId),
      ...this.createConcreteContext<T, R>(
        methodMetadata,
        contextId,
        inquirerId,
      ),
    ] as R;
  }

  /**
   * 从控制器类的构造函数上反射读取类级元数据（@UseXxx 装饰在类上时写入）。
   * @param instance - 控制器实例
   * @param metadataKey - 元数据键
   * @returns 类级元数据；未声明时为 undefined
   */
  public reflectClassMetadata<T>(instance: Controller, metadataKey: string): T {
    const prototype = Object.getPrototypeOf(instance);
    return Reflect.getMetadata(metadataKey, prototype.constructor);
  }

  /**
   * 从路由处理方法上反射读取方法级元数据（@UseXxx 装饰在方法上时写入）。
   * @param callback - 路由处理方法
   * @param metadataKey - 元数据键
   * @returns 方法级元数据；未声明时为 undefined
   */
  public reflectMethodMetadata<T>(
    callback: (...args: unknown[]) => unknown,
    metadataKey: string,
  ): T {
    return Reflect.getMetadata(metadataKey, callback);
  }

  /**
   * 结合“持久依赖树（durable）”信息解析实际的上下文 ID：当请求级上下文
   * 与 durable 依赖树共享时，可复用父级上下文，避免重复创建实例。
   * @param contextId - 原始请求上下文 ID
   * @param instanceWrapper - 待解析的实例包装器
   * @returns 实际应使用的上下文 ID
   */
  protected getContextId(
    contextId: ContextId,
    instanceWrapper: InstanceWrapper,
  ): ContextId {
    return contextId.getParent
      ? contextId.getParent({
          token: instanceWrapper.token,
          isTreeDurable: instanceWrapper.isDependencyTreeDurable(),
        })
      : contextId;
  }
}
