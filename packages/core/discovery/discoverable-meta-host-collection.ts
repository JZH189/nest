import { Type } from '@nestjs/common';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { ModulesContainer } from '../injector/modules-container';

/**
 * 可发现元数据"主机集合"：DiscoveryService 按元数据键筛选
 * providers/controllers 时的全局注册表。
 *
 * 工作原理：
 * - DiscoveryService.createDecorator() 创建装饰器时生成唯一 metadataKey，
 *   并通过 addClassMetaHostLink 记录"类 → 元数据键"链接；
 * - 容器实例化每个 provider/controller 时，框架回调 inspectProvider /
 *   inspectController，将带该元数据键的实例包装器按
 *   "应用（ModulesContainer）→ 元数据键 → 包装器集合"归类存储；
 * - getProvidersByMetaKey / getControllersByMetaKey 随后可按键快速检索。
 */
export class DiscoverableMetaHostCollection {
  /**
   * A map of class references to metadata keys.
   */
  public static readonly metaHostLinks = new Map<Type | Function, string>();

  /**
   * A map of metadata keys to instance wrappers (providers) with the corresponding metadata key.
   * The map is weakly referenced by the modules container (unique per application).
   */
  private static readonly providersByMetaKey = new WeakMap<
    ModulesContainer,
    Map<string, Set<InstanceWrapper>>
  >();

  /**
   * A map of metadata keys to instance wrappers (controllers) with the corresponding metadata key.
   * The map is weakly referenced by the modules container (unique per application).
   */
  private static readonly controllersByMetaKey = new WeakMap<
    ModulesContainer,
    Map<string, Set<InstanceWrapper>>
  >();

  /**
   * Adds a link between a class reference and a metadata key.
   * @param target The class reference.
   * @param metadataKey The metadata key.
   */
  public static addClassMetaHostLink(
    target: Type | Function,
    metadataKey: string,
  ) {
    this.metaHostLinks.set(target, metadataKey);
  }

  /**
   * Inspects a provider instance wrapper and adds it to the collection of providers
   * if it has a metadata key.
   * @param hostContainerRef A reference to the modules container.
   * @param instanceWrapper A provider instance wrapper.
   * @returns void
   */
  public static inspectProvider(
    hostContainerRef: ModulesContainer,
    instanceWrapper: InstanceWrapper,
  ) {
    return this.inspectInstanceWrapper(
      hostContainerRef,
      instanceWrapper,
      this.providersByMetaKey,
    );
  }

  /**
   * Inspects a controller instance wrapper and adds it to the collection of controllers
   * if it has a metadata key.
   * @param hostContainerRef A reference to the modules container.
   * @param instanceWrapper A controller's instance wrapper.
   * @returns void
   */
  public static inspectController(
    hostContainerRef: ModulesContainer,
    instanceWrapper: InstanceWrapper,
  ) {
    return this.inspectInstanceWrapper(
      hostContainerRef,
      instanceWrapper,
      this.controllersByMetaKey,
    );
  }

  /**
   * 将实例包装器按元数据键插入到指定集合
   * （键不存在时先创建空集合）。
   *
   * @param metaKey - 元数据键
   * @param instanceWrapper - 实例包装器
   * @param collection - 键到包装器集合的映射
   */
  public static insertByMetaKey(
    metaKey: string,
    instanceWrapper: InstanceWrapper,
    collection: Map<string, Set<InstanceWrapper>>,
  ) {
    if (collection.has(metaKey)) {
      const wrappers = collection.get(metaKey)!;
      wrappers.add(instanceWrapper);
    } else {
      const wrappers = new Set<InstanceWrapper>();
      wrappers.add(instanceWrapper);
      collection.set(metaKey, wrappers);
    }
  }

  /**
   * 按元数据键检索指定应用中所有已登记的 provider 包装器。
   *
   * @param hostContainerRef - 模块容器引用（唯一标识一个应用）
   * @param metaKey - 元数据键
   * @returns 匹配的实例包装器集合（无匹配时为空集合）
   */
  public static getProvidersByMetaKey(
    hostContainerRef: ModulesContainer,
    metaKey: string,
  ): Set<InstanceWrapper> {
    const wrappersByMetaKey = this.providersByMetaKey.get(hostContainerRef);
    return wrappersByMetaKey?.get(metaKey) ?? new Set<InstanceWrapper>();
  }

  /**
   * 按元数据键检索指定应用中所有已登记的 controller 包装器。
   *
   * @param hostContainerRef - 模块容器引用（唯一标识一个应用）
   * @param metaKey - 元数据键
   * @returns 匹配的实例包装器集合（无匹配时为空集合）
   */
  public static getControllersByMetaKey(
    hostContainerRef: ModulesContainer,
    metaKey: string,
  ): Set<InstanceWrapper> {
    const wrappersByMetaKey = this.controllersByMetaKey.get(hostContainerRef);
    return wrappersByMetaKey?.get(metaKey) ?? new Set<InstanceWrapper>();
  }

  /**
   * 检查实例包装器是否携带可发现元数据键：
   * 有则归入按应用与元数据键组织的集合中。
   *
   * @param hostContainerRef - 模块容器引用
   * @param instanceWrapper - 实例包装器
   * @param wrapperByMetaKeyMap - 目标存储映射（providers 或 controllers）
   */
  private static inspectInstanceWrapper(
    hostContainerRef: ModulesContainer,
    instanceWrapper: InstanceWrapper,
    wrapperByMetaKeyMap: WeakMap<
      ModulesContainer,
      Map<string, Set<InstanceWrapper>>
    >,
  ) {
    const metaKey =
      DiscoverableMetaHostCollection.getMetaKeyByInstanceWrapper(
        instanceWrapper,
      );
    if (!metaKey) {
      return;
    }

    let collection: Map<string, Set<InstanceWrapper>>;
    if (wrapperByMetaKeyMap.has(hostContainerRef)) {
      collection = wrapperByMetaKeyMap.get(hostContainerRef)!;
    } else {
      collection = new Map<string, Set<InstanceWrapper>>();
      wrapperByMetaKeyMap.set(hostContainerRef, collection);
    }
    this.insertByMetaKey(metaKey, instanceWrapper, collection);
  }

  /**
   * 从实例包装器解析出其类上的元数据键。
   * 对 useValue/useFactory 场景需要回退到 instance.constructor
   * 才能取到真正的类（见下方源码注释），但为避免性能开销尽量延迟该访问。
   *
   * @param instanceWrapper - 实例包装器
   * @returns 元数据键；未登记时为 undefined
   */
  private static getMetaKeyByInstanceWrapper(
    instanceWrapper: InstanceWrapper<any>,
  ) {
    return this.metaHostLinks.get(
      // NOTE: Regarding the ternary statement below,
      // - The condition `!wrapper.metatype` is needed because when we use `useValue`
      // the value of `wrapper.metatype` will be `null`.
      // - The condition `wrapper.inject` is needed here because when we use
      // `useFactory`, the value of `wrapper.metatype` will be the supplied
      // factory function.
      // For both cases, we should use `wrapper.instance.constructor` instead
      // of `wrapper.metatype` to resolve processor's class properly.
      // But since calling `wrapper.instance` could degrade overall performance
      // we must defer it as much we can.
      instanceWrapper.metatype || instanceWrapper.inject
        ? (instanceWrapper.instance?.constructor ?? instanceWrapper.metatype)
        : instanceWrapper.metatype,
    );
  }
}
