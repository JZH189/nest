import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { Controller, NestInterceptor, Type } from '@nestjs/common/interfaces';
import { isEmpty, isFunction } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { ApplicationConfig } from '../application-config';
import { ContextCreator } from '../helpers/context-creator';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { InstanceWrapper } from '../injector/instance-wrapper';

/**
 * 拦截器上下文创建器（Interceptors Context Creator）：在路由处理器
 * 被调用前，负责解析并实例化应该作用于该处理器的全部拦截器。
 *
 * 在框架中的角色：继承通用的 ContextCreator，按"方法级 -> 类级"的顺序
 * 读取 @UseInterceptors 元数据（INTERCEPTORS_METADATA），结合全局拦截器
 * （含请求作用域的全局拦截器）从容器中取出实际实例，最终交给
 * InterceptorsConsumer 执行。
 */
export class InterceptorsContextCreator extends ContextCreator {
  /** 当前请求所处理的目标模块 token，用于在容器中定位模块。 */
  private moduleContext: string;

  /**
   * @param container - 应用 IoC 容器，用于查找拦截器实例。
   * @param config - 应用配置，用于获取全局拦截器列表。
   */
  constructor(
    private readonly container: NestContainer,
    private readonly config?: ApplicationConfig,
  ) {
    super();
  }

  /**
   * 为指定的 controller 方法创建拦截器实例数组（方法级 + 类级）。
   *
   * @param instance - controller 实例。
   * @param callback - 处理器方法。
   * @param module - 该 controller 所在模块的 token。
   * @param contextId - 请求上下文 id（请求作用域实例按此区分）。
   * @param inquirerId - 请求发起者 id（用于 DURABLE 作用域）。
   * @returns 按执行顺序排列的拦截器实例数组。
   */
  public create(
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
    module: string,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): NestInterceptor[] {
    this.moduleContext = module;
    return this.createContext(
      instance,
      callback,
      INTERCEPTORS_METADATA,
      contextId,
      inquirerId,
    );
  }

  /**
   * 将 @UseInterceptors 元数据（类引用或带 intercept 的对象）解析为
   * 实际的拦截器实例数组：过滤无效项，逐个从容器取实例，并确保
   * 实例上确实定义了 intercept 方法。
   *
   * @param metadata - 拦截器元数据数组。
   * @param contextId - 请求上下文 id。
   * @param inquirerId - 请求发起者 id。
   * @returns 解析后的拦截器实例数组。
   */
  public createConcreteContext<T extends any[], R extends any[]>(
    metadata: T,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): R {
    if (isEmpty(metadata)) {
      return [] as any[] as R;
    }
    return iterate(metadata)
      .filter(
        interceptor =>
          interceptor && (interceptor.name || interceptor.intercept),
      )
      .map(
        interceptor =>
          this.getInterceptorInstance(interceptor, contextId, inquirerId)!,
      )
      .filter((interceptor: NestInterceptor) =>
        interceptor ? isFunction(interceptor.intercept) : false,
      )
      .toArray() as R;
  }

  /**
   * 获取单个拦截器的实例：
   * 1. 若元数据本身是带 intercept 方法的对象（函数式拦截器），直接返回；
   * 2. 否则视为类引用，从当前模块的 injectables 集合中解析出实例。
   *
   * @param metatype - 拦截器类引用或拦截器对象。
   * @param contextId - 请求上下文 id。
   * @param inquirerId - 请求发起者 id。
   * @returns 拦截器实例；无法解析时返回 null。
   */
  public getInterceptorInstance(
    metatype: Function | NestInterceptor,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): NestInterceptor | null {
    const isObject = !!(metatype as NestInterceptor).intercept;
    if (isObject) {
      return metatype as NestInterceptor;
    }
    const instanceWrapper = this.getInstanceByMetatype(
      metatype as Type<unknown>,
    );
    if (!instanceWrapper) {
      return null;
    }
    const instanceHost = instanceWrapper.getInstanceByContextId(
      this.getContextId(contextId, instanceWrapper),
      inquirerId,
    );
    return instanceHost && instanceHost.instance;
  }

  /**
   * 按类引用在当前模块的 injectables 集合中查找拦截器的实例包装器。
   *
   * @param metatype - 拦截器类引用。
   * @returns 对应的实例包装器；未找到时返回 undefined。
   */
  public getInstanceByMetatype(
    metatype: Type<unknown>,
  ): InstanceWrapper | undefined {
    if (!this.moduleContext) {
      return;
    }
    const collection = this.container.getModules();
    const moduleRef = collection.get(this.moduleContext);
    if (!moduleRef) {
      return;
    }
    return moduleRef.injectables.get(metatype);
  }

  /**
   * 获取全局拦截器元数据：
   * 1. 静态上下文且无 inquirer 时，直接返回 app.useGlobalInterceptors 注册的全局拦截器；
   * 2. 否则追加请求作用域（REQUEST/DURABLE）的全局拦截器，并按当前上下文 id 解析实例。
   *
   * @param contextId - 请求上下文 id。
   * @param inquirerId - 请求发起者 id。
   * @returns 全局（含请求作用域）拦截器的元数据/实例数组。
   */
  public getGlobalMetadata<T extends unknown[]>(
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): T {
    if (!this.config) {
      return [] as unknown[] as T;
    }
    const globalInterceptors = this.config.getGlobalInterceptors() as T;
    if (contextId === STATIC_CONTEXT && !inquirerId) {
      return globalInterceptors;
    }
    const scopedInterceptorWrappers =
      this.config.getGlobalRequestInterceptors() as InstanceWrapper[];
    const scopedInterceptors = iterate(scopedInterceptorWrappers)
      .map(wrapper =>
        wrapper.getInstanceByContextId(
          this.getContextId(contextId, wrapper),
          inquirerId,
        ),
      )
      .filter(host => !!host)
      .map(host => host.instance)
      .toArray();

    return globalInterceptors.concat(scopedInterceptors) as T;
  }
}
