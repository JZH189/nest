import { CanActivate } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Controller, Type } from '@nestjs/common/interfaces';
import { isEmpty, isFunction } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { ApplicationConfig } from '../application-config';
import { ContextCreator } from '../helpers/context-creator';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { InstanceWrapper } from '../injector/instance-wrapper';

/**
 * 守卫上下文创建器：把 @UseGuards() 声明的守卫编译成可执行的守卫实例数组。
 *
 * 在框架中的角色：路由代理在路由注册阶段调用本类 create()，得到该路由
 * 应执行的全部守卫（全局 + 控制器级 + 方法级）；请求到达时由
 * GuardsConsumer.tryActivate() 逐个执行。守卫在请求管道中的执行时机是
 * 中间件之后、拦截器之前。本类继承 ContextCreator，复用元数据收集模板逻辑。
 */
export class GuardsContextCreator extends ContextCreator {
  private moduleContext: string;

  constructor(
    private readonly container: NestContainer,
    private readonly config?: ApplicationConfig,
  ) {
    super();
  }

  /**
   * 为指定控制器方法创建守卫实例数组。
   * @param instance - 控制器实例
   * @param callback - 路由处理方法
   * @param module - 控制器所属模块标识（token），用于解析守卫类的 DI 实例
   * @param contextId - 请求上下文 ID（请求级作用域用），默认为静态上下文
   * @param inquirerId - 请求发起者 ID（瞬态作用域用）
   * @returns 依次执行的守卫实例数组（全局守卫在前）
   */
  public create(
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
    module: string,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): CanActivate[] {
    // 记录模块上下文，供 getInstanceByMetatype 解析守卫类实例
    this.moduleContext = module;
    return this.createContext(
      instance,
      callback,
      GUARDS_METADATA,
      contextId,
      inquirerId,
    );
  }

  /**
   * 将 GUARDS_METADATA 元数据编译为守卫实例数组。
   * @param metadata - 通过装饰器收集到的守卫类/实例元数据
   * @param contextId - 请求上下文 ID，默认为静态上下文
   * @param inquirerId - 请求发起者 ID
   * @returns 有效守卫实例数组；无元数据时返回空数组
   */
  public createConcreteContext<T extends unknown[], R extends unknown[]>(
    metadata: T,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): R {
    if (isEmpty(metadata)) {
      return [] as unknown[] as R;
    }
    return iterate(metadata)
      .filter((guard: any) => guard && (guard.name || guard.canActivate))
      .map(guard =>
        this.getGuardInstance(guard as Function, contextId, inquirerId),
      )
      .filter(
        (guard: CanActivate | null) => !!guard && isFunction(guard.canActivate),
      )
      .toArray() as R;
  }

  /**
   * 根据传入的守卫（实例或类）解析出真正的守卫实例。
   * @param metatype - 守卫，可能是已实例化对象（带 canActivate），也可能是需从 DI 容器解析的类
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 请求发起者 ID
   * @returns 解析出的守卫实例；无法解析时返回 null
   */
  public getGuardInstance(
    metatype: Function | CanActivate,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): CanActivate | null {
    // 已是实例（带 canActivate 方法）则直接返回
    const isObject = !!(metatype as CanActivate).canActivate;
    if (isObject) {
      return metatype as CanActivate;
    }
    // 否则按类处理，从模块的可注入集合中解析实例（支持请求级/瞬态作用域）
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
   * 按类的元类型从当前模块中查找对应的实例包装器。
   * @param metatype - 守卫类的构造函数
   * @returns 找到的 InstanceWrapper；无模块上下文或未注册时返回 undefined
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
    const injectables = moduleRef.injectables;
    return injectables.get(metatype);
  }

  /**
   * 获取全局守卫：包含全局静态守卫与当前请求上下文下解析的请求级守卫实例。
   * @param contextId - 请求上下文 ID，默认为静态上下文
   * @param inquirerId - 请求发起者 ID
   * @returns 合并后的全局守卫数组
   */
  public getGlobalMetadata<T extends unknown[]>(
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): T {
    if (!this.config) {
      return [] as unknown[] as T;
    }
    // 应用启动阶段（app.useGlobalGuards）注册的全局守卫
    const globalGuards = this.config.getGlobalGuards() as T;
    if (contextId === STATIC_CONTEXT && !inquirerId) {
      return globalGuards;
    }
    // 请求级作用域的全局守卫需在当前请求上下文中解析实例
    const scopedGuardWrappers =
      this.config.getGlobalRequestGuards() as InstanceWrapper[];
    const scopedGuards = iterate(scopedGuardWrappers)
      .map(wrapper =>
        wrapper.getInstanceByContextId(
          this.getContextId(contextId, wrapper),
          inquirerId,
        ),
      )
      .filter(host => !!host)
      .map(host => host.instance)
      .toArray();

    return globalGuards.concat(scopedGuards) as T;
  }
}
