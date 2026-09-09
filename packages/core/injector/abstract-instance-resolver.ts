import { Abstract, Scope, Type } from '@nestjs/common';
import { GetOrResolveOptions } from '@nestjs/common/interfaces';
import {
  InvalidClassScopeException,
  UnknownElementException,
} from '../errors/exceptions';
import { Injector } from './injector';
import { InstanceLink, InstanceLinksHost } from './instance-links-host';
import { ContextId } from './instance-wrapper';
import { Module } from './module';

/**
 * 实例解析器的公共抽象基类：为 ModuleRef（以及应用上下文）
 * 提供从实例链接表中"取实例"的通用逻辑。
 *
 * 两条解析路径：
 * - find：同步获取静态（单例）实例，请求/transient 作用域会抛出 InvalidClassScopeException
 * - resolvePerContext：按请求上下文异步解析，可处理请求作用域与 transient 实例
 */
export abstract class AbstractInstanceResolver {
  /** 实例链接表宿主（token -> 各模块中的实例链接） */
  protected abstract instanceLinksHost: InstanceLinksHost;
  /** 依赖注入器（按上下文加载实例） */
  protected abstract injector: Injector;

  /**
   * 获取实例的抽象方法，由子类实现（决定查找范围与 each 语义）
   */
  protected abstract get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options?: GetOrResolveOptions,
  ): TResult | Array<TResult>;

  /**
   * 同步查找静态实例
   *
   * 从实例链接表取出 wrapper 并返回其实例；
   * 若 wrapper 是请求作用域、transient 或依赖树非静态，则无法同步获取，
   * 抛出 InvalidClassScopeException（提示应改用 resolve）。
   *
   * @param typeOrToken - 类型、抽象类或注入 token
   * @param options - 查找选项（moduleId 限定模块，each 返回全部）
   * @returns 实例或实例数组
   */
  protected find<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Abstract<TInput> | string | symbol,
    options: { moduleId?: string; each?: boolean },
  ): TResult | Array<TResult> {
    const instanceLinkOrArray = this.instanceLinksHost.get<TResult>(
      typeOrToken,
      options,
    );
    const pluckInstance = ({ wrapperRef }: InstanceLink) => {
      if (
        wrapperRef.scope === Scope.REQUEST ||
        wrapperRef.scope === Scope.TRANSIENT ||
        !wrapperRef.isDependencyTreeStatic()
      ) {
        throw new InvalidClassScopeException(typeOrToken);
      }
      return wrapperRef.instance;
    };
    if (Array.isArray(instanceLinkOrArray)) {
      return instanceLinkOrArray.map(pluckInstance);
    }
    return pluckInstance(instanceLinkOrArray);
  }

  /**
   * 按请求上下文解析实例（支持请求作用域与 transient）
   *
   * 处理流程：
   * 1. 按 strict 选项决定是否将查找限定在宿主模块内
   * 2. 依赖树静态且非 transient 的 wrapper 直接返回共享的单例实例
   * 3. 否则调用 injector.loadPerContext 在该上下文中（懒）创建实例；
   *    创建失败抛出 UnknownElementException
   *
   * @param typeOrToken - 类型、抽象类或注入 token
   * @param contextModule - 发起解析的上下文模块
   * @param contextId - 请求上下文 ID
   * @param options - 查找选项
   * @returns 实例或实例数组
   */
  protected async resolvePerContext<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Abstract<TInput> | string | symbol,
    contextModule: Module,
    contextId: ContextId,
    options?: GetOrResolveOptions,
  ): Promise<TResult | Array<TResult>> {
    const instanceLinkOrArray = options?.strict
      ? this.instanceLinksHost.get(typeOrToken, {
          moduleId: contextModule.id,
          each: options.each,
        })
      : this.instanceLinksHost.get(typeOrToken, {
          each: options?.each,
        });

    const pluckInstance = async (instanceLink: InstanceLink) => {
      const { wrapperRef, collection } = instanceLink;
      if (wrapperRef.isDependencyTreeStatic() && !wrapperRef.isTransient) {
        return wrapperRef.instance;
      }

      const ctorHost = wrapperRef.instance || { constructor: typeOrToken };
      const instance = await this.injector.loadPerContext(
        ctorHost,
        wrapperRef.host!,
        collection,
        contextId,
        wrapperRef,
      );
      if (!instance) {
        throw new UnknownElementException();
      }
      return instance;
    };

    if (Array.isArray(instanceLinkOrArray)) {
      return Promise.all(
        instanceLinkOrArray.map(instanceLink => pluckInstance(instanceLink)),
      );
    }
    return pluckInstance(instanceLinkOrArray);
  }
}
