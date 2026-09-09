import { IntrospectionResult, Scope, Type } from '@nestjs/common';
import { getClassScope } from '../helpers/get-class-scope';
import { isDurable } from '../helpers/is-durable';
import { AbstractInstanceResolver } from './abstract-instance-resolver';
import { STATIC_CONTEXT } from './constants';
import { NestContainer } from './container';
import { Injector } from './injector';
import { InstanceLinksHost } from './instance-links-host';
import { ContextId, InstanceWrapper } from './instance-wrapper';
import { Module } from './module';

/**
 * ModuleRef get/resolve 的通用选项
 */
export interface ModuleRefGetOrResolveOpts {
  /**
   * If enabled, lookup will only be performed in the host module.
   * @default true
   */
  strict?: boolean;
  /**
   * If enabled, instead of returning a first instance registered under a given token,
   * a list of instances will be returned.
   * @default false
   */
  each?: boolean;
}

/**
 * ModuleRef：模块引用基类，提供在运行时手动获取/创建依赖实例的能力
 * （即用户在类中注入的 `ModuleRef`，以及 NestApplicationContext 的部分能力来源）。
 *
 * 核心能力分三类：
 * - `get`：同步获取静态（单例）实例
 * - `resolve`：按请求上下文解析请求作用域 / transient 实例
 * - `create`：完全脱离容器，仅借助 DI 解析来实例化一个类
 *
 * 每个模块都会通过 Module#createModuleReferenceType 得到一个
 * 绑定到该模块上下文（strict 查找限定宿主模块）的子类实例。
 */
export abstract class ModuleRef extends AbstractInstanceResolver {
  /** 依赖注入器（按需加载实例） */
  protected readonly injector: Injector;
  /** 实例链接宿主（懒初始化，首次访问时扫描容器建立索引） */
  private _instanceLinksHost: InstanceLinksHost;

  /** 懒获取实例链接宿主 */
  protected get instanceLinksHost() {
    if (!this._instanceLinksHost) {
      this._instanceLinksHost = new InstanceLinksHost(this.container);
    }
    return this._instanceLinksHost;
  }

  /**
   * 创建 ModuleRef 实例
   *
   * @param container - IoC 容器引用（用于建立实例链接索引与注册请求 provider）
   */
  constructor(protected readonly container: NestContainer) {
    super();

    this.injector = new Injector({
      preview: container.contextOptions?.preview!,
      instanceDecorator:
        container.contextOptions?.instrument?.instanceDecorator,
    });
  }

  /**
   * Retrieves an instance of either injectable or controller, otherwise, throws exception.
   * @returns {TResult}
   */
  abstract get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
  ): TResult;
  /**
   * Retrieves an instance of either injectable or controller, otherwise, throws exception.
   * @returns {TResult}
   */
  abstract get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options: {
      /**
       * If enabled, lookup will only be performed in the host module.
       * @default true
       */
      strict?: boolean;
      /** This indicates that only the first instance registered will be returned. */
      each?: undefined | false;
    },
  ): TResult;
  /**
   * Retrieves a list of instances of either injectables or controllers, otherwise, throws exception.
   * @returns {Array<TResult>}
   */
  abstract get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options: {
      /**
       * If enabled, lookup will only be performed in the host module.
       * @default true
       */
      strict?: boolean;
      /** This indicates that a list of instances will be returned. */
      each: true;
    },
  ): Array<TResult>;
  /**
   * Retrieves an instance (or a list of instances) of either injectable or controller, otherwise, throws exception.
   * @returns {TResult | Array<TResult>}
   */
  abstract get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options?: ModuleRefGetOrResolveOpts,
  ): TResult | Array<TResult>;

  /**
   * Resolves transient or request-scoped instance of either injectable or controller, otherwise, throws exception.
   * @returns {Array<TResult>}
   */
  abstract resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
  ): Promise<TResult>;
  /**
   * Resolves transient or request-scoped instance of either injectable or controller, otherwise, throws exception.
   * @returns {Array<TResult>}
   */
  abstract resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: { id: number },
  ): Promise<TResult>;
  /**
   * Resolves transient or request-scoped instance of either injectable or controller, otherwise, throws exception.
   * @returns {Array<TResult>}
   */
  abstract resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: { id: number },
    options?: { strict?: boolean; each?: undefined | false },
  ): Promise<TResult>;
  /**
   * Resolves transient or request-scoped instances of either injectables or controllers, otherwise, throws exception.
   * @returns {Array<TResult>}
   */
  abstract resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: { id: number },
    options?: { strict?: boolean; each: true },
  ): Promise<Array<TResult>>;
  /**
   * Resolves transient or request-scoped instance (or a list of instances) of either injectable or controller, otherwise, throws exception.
   * @returns {Promise<TResult | Array<TResult>>}
   */
  abstract resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: { id: number },
    options?: ModuleRefGetOrResolveOpts,
  ): Promise<TResult | Array<TResult>>;

  public abstract create<T = any>(
    type: Type<T>,
    contextId?: ContextId,
  ): Promise<T>;

  /**
   * 内省 provider 的作用域（DEFAULT/REQUEST/TRANSIENT）
   *
   * @param token - 注入 token
   * @returns 包含推断出的作用域信息
   */
  public introspect<T = any>(
    token: Type<T> | string | symbol,
  ): IntrospectionResult {
    const { wrapperRef } = this.instanceLinksHost.get(token);

    let scope = Scope.DEFAULT;
    if (!wrapperRef.isDependencyTreeStatic()) {
      scope = Scope.REQUEST;
    } else if (wrapperRef.isTransient) {
      scope = Scope.TRANSIENT;
    }
    return { scope };
  }

  /**
   * 为指定上下文注册请求对象（使其可被 REQUEST token 注入）
   *
   * @param request - 请求对象
   * @param contextId - 请求上下文 ID
   */
  public registerRequestByContextId<T = any>(request: T, contextId: ContextId) {
    this.container.registerRequestProvider(request, contextId);
  }

  /**
   * 借助 DI 解析机制实例化一个类（不注册进容器，ModuleRef#create 的底层实现）
   *
   * 处理流程：
   * 1. 为目标类临时创建一个 InstanceWrapper（继承类上的作用域/durable 元数据）
   * 2. 若类可实例化，先写入一个基于原型的空壳实例记录
   * 3. 复用 Injector 的 resolveConstructorParams / resolveProperties /
   *    applyProperties 完成构造参数与属性注入，最终 new 出实例
   *
   * @param type - 待实例化的类
   * @param moduleRef - 提供依赖解析上下文的模块
   * @param contextId - 请求上下文 ID（可选）
   * @returns 创建好的实例
   */
  protected async instantiateClass<T = any>(
    type: Type<T>,
    moduleRef: Module,
    contextId?: ContextId,
  ): Promise<T> {
    const wrapper = new InstanceWrapper({
      name: type && type.name,
      metatype: type,
      isResolved: false,
      scope: getClassScope(type),
      durable: isDurable(type),
      host: moduleRef,
    });

    if (type?.prototype) {
      wrapper.setInstanceByContextId(contextId ?? STATIC_CONTEXT, {
        instance: Object.create(type.prototype),
        isResolved: false,
        isPending: false,
      });
    }

    /* eslint-disable-next-line no-async-promise-executor */
    return new Promise<T>(async (resolve, reject) => {
      try {
        const callback = async (instances: any[]) => {
          const properties = await this.injector.resolveProperties(
            wrapper,
            moduleRef,
            undefined,
            contextId,
            wrapper,
          );
          const instance = new type(...instances);
          this.injector.applyProperties(instance, properties);
          resolve(instance);
        };
        await this.injector.resolveConstructorParams<T>(
          wrapper,
          moduleRef,
          undefined,
          callback,
          contextId,
          wrapper,
        );
      } catch (err) {
        reject(err);
      }
    });
  }
}
