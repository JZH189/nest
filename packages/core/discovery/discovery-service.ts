import {
  CustomDecorator,
  flatten,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { uid } from 'uid';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';
import { ModulesContainer } from '../injector/modules-container';
import { DiscoverableMetaHostCollection } from './discoverable-meta-host-collection';

/**
 * 按模块白名单筛选的发现选项。
 *
 * @publicApi
 */
export interface FilterByInclude {
  /**
   * List of modules to include (whitelist) into the discovery process.
   */
  include?: Function[];
}

/**
 * 按元数据键筛选的发现选项：仅返回带有该元数据键的实例包装器。
 *
 * @publicApi
 */
export interface FilterByMetadataKey {
  /**
   * A key to filter controllers and providers by.
   * Only instance wrappers with the specified metadata key will be returned.
   */
  metadataKey?: string;
}

/**
 * DiscoveryService 的筛选选项：模块白名单（include）或元数据键（metadataKey）二选一。
 *
 * @publicApi
 */
export type DiscoveryOptions = FilterByInclude | FilterByMetadataKey;

/**
 * 可发现装饰器的类型：调用后返回自定义装饰器，
 * 并静态持有其元数据键（KEY），供 getMetadataByDecorator 读取元数据。
 *
 * @publicApi
 */
export type DiscoverableDecorator<T> = ((opts?: T) => CustomDecorator) & {
  KEY: string;
};

/**
 * 发现服务（DiscoveryService）：在运行时"发现"容器中的 providers/controllers
 * 的工具服务，是构建可插拔架构（如自动注册任务、事件处理器）的基础。
 *
 * 两种发现方式：
 * - 全量发现：遍历所有（或 include 白名单中的）模块的 providers/controllers；
 * - 按元数据发现：通过 DiscoveryService.createDecorator() 创建的装饰器
 *   标注目标类/方法，再用 metadataKey 精确筛选，配合 getMetadataByDecorator
 *   读取标注时携带的元数据。
 *
 * 该服务本身是一个可注入的 provider（由 DiscoveryModule 导出）。
 *
 * @publicApi
 */
@Injectable()
export class DiscoveryService {
  /**
   * @param modulesContainer - 当前应用的所有模块容器（由框架注入）
   */
  constructor(private readonly modulesContainer: ModulesContainer) {}

  /**
   * Creates a decorator that can be used to decorate classes and methods with metadata.
   * The decorator will also add the class to the collection of discoverable classes (by metadata key).
   * Decorated classes can be discovered using the `getProviders` and `getControllers` methods.
   * @returns A decorator function.
   */
  static createDecorator<T>(): DiscoverableDecorator<T> {
    const metadataKey = uid(21);
    const decoratorFn =
      (opts: T) =>
      (target: object | Function, key?: string | symbol, descriptor?: any) => {
        if (!descriptor) {
          DiscoverableMetaHostCollection.addClassMetaHostLink(
            target as Function,
            metadataKey,
          );
        }
        SetMetadata(metadataKey, opts ?? {})(target, key!, descriptor);
      };

    decoratorFn.KEY = metadataKey;
    return decoratorFn as DiscoverableDecorator<T>;
  }

  /**
   * 发现所有 providers：
   * - 传入 metadataKey 时，从元主机集合（DiscoverableMetaHostCollection）
   *   中按元数据键精确查找；
   * - 否则遍历模块（或 include 白名单模块）的所有 providers。
   *
   * @param options Discovery options.
   * @param modules A list of modules to filter by.
   * @returns An array of instance wrappers (providers).
   */
  public getProviders(
    options: DiscoveryOptions = {},
    modules: Module[] = this.getModules(options),
  ): InstanceWrapper[] {
    if ('metadataKey' in options) {
      const providers = DiscoverableMetaHostCollection.getProvidersByMetaKey(
        this.modulesContainer,
        options.metadataKey!,
      );
      return Array.from(providers);
    }

    const providers = modules.map(item => [...item.providers.values()]);
    return flatten(providers);
  }

  /**
   * 发现所有 controllers（逻辑与 getProviders 对称）：
   * - 传入 metadataKey 时按元数据键精确查找；
   * - 否则遍历模块（或白名单模块）的所有 controllers。
   *
   * @param options Discovery options.
   * @param modules A list of modules to filter by.
   * @returns An array of instance wrappers (controllers).
   */
  public getControllers(
    options: DiscoveryOptions = {},
    modules: Module[] = this.getModules(options),
  ): InstanceWrapper[] {
    if ('metadataKey' in options) {
      const controllers =
        DiscoverableMetaHostCollection.getControllersByMetaKey(
          this.modulesContainer,
          options.metadataKey!,
        );
      return Array.from(controllers);
    }

    const controllers = modules.map(item => [...item.controllers.values()]);
    return flatten(controllers);
  }

  /**
   * 读取 createDecorator 创建的装饰器在实例（或其方法）上标注的元数据。
   * - 传入 methodKey 时从实例方法上读取（方法级装饰器）；
   * - 否则从实例的类（或元类型）上读取（类级装饰器）。
   *
   * @param decorator The decorator to retrieve metadata of.
   * @param instanceWrapper Reference to the instance wrapper.
   * @param methodKey An optional method key to retrieve metadata from.
   * @returns Discovered metadata.
   */
  public getMetadataByDecorator<T extends DiscoverableDecorator<any>>(
    decorator: T,
    instanceWrapper: InstanceWrapper,
    methodKey?: string,
  ): T extends DiscoverableDecorator<infer R> ? R | undefined : T | undefined {
    if (methodKey) {
      return Reflect.getMetadata(
        decorator.KEY,
        instanceWrapper.instance[methodKey],
      );
    }

    const clsRef =
      instanceWrapper.instance?.constructor ?? instanceWrapper.metatype;
    return Reflect.getMetadata(decorator.KEY, clsRef);
  }

  /**
   * 获取用于发现的模块列表：
   * 未指定 include 时返回容器中的所有模块；否则只返回白名单中的模块。
   *
   * @returns 待发现的模块列表
   */
  protected getModules(options: DiscoveryOptions = {}): Module[] {
    const includeInOpts = 'include' in options;
    if (!includeInOpts) {
      const moduleRefs = [...this.modulesContainer.values()];
      return moduleRefs;
    }
    const whitelisted = this.includeWhitelisted(options.include!);
    return whitelisted;
  }

  /**
   * 按白名单过滤模块：只保留 metatype 在 include 列表中的模块。
   *
   * @param include - 模块类白名单
   * @returns 过滤后的模块列表
   */
  private includeWhitelisted(include: Function[]): Module[] {
    const moduleRefs = [...this.modulesContainer.values()];
    return moduleRefs.filter(({ metatype }) =>
      include.some(item => item === metatype),
    );
  }
}
