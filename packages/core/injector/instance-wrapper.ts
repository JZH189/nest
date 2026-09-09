import { Logger, LoggerService, Provider, Scope, Type } from '@nestjs/common';
import { EnhancerSubtype } from '@nestjs/common/constants';
import { FactoryProvider, InjectionToken } from '@nestjs/common/interfaces';
import { clc } from '@nestjs/common/utils/cli-colors.util';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import {
  isNil,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { UuidFactory } from '../inspector/uuid-factory';
import { STATIC_CONTEXT } from './constants';
import {
  isClassProvider,
  isFactoryProvider,
  isValueProvider,
} from './helpers/provider-classifier';
import { Module } from './module';
import { SettlementSignal } from './settlement-signal';

/** 实例元数据缓存（构造参数依赖/属性依赖/增强器）挂在 wrapper 上的 Symbol 键 */
export const INSTANCE_METADATA_SYMBOL = Symbol.for('instance_metadata:cache');
/** 实例包装器唯一 ID 挂在 wrapper 上的 Symbol 键 */
export const INSTANCE_ID_SYMBOL = Symbol.for('instance_metadata:id');

/**
 * 宿主组件信息：描述请求作用域实例的"询问者"（宿主）上下文，
 * 用于 durable 子树沿父链查找 ContextId。
 */
export interface HostComponentInfo {
  /**
   * Injection token (or class reference)
   */
  token: InjectionToken;
  /**
   * Flag that indicates whether DI subtree is durable
   */
  isTreeDurable: boolean;
}

/**
 * 上下文 ID：标识一次请求（或自定义执行上下文）。
 *
 * - `id`：上下文的数字标识（同一次请求内所有实例共享）
 * - `payload`：可选负载（如 Durable 场景附加的信息）
 * - `getParent`：durable 实例沿宿主链向上查找所属上下文的回调
 */
export interface ContextId {
  readonly id: number;
  payload?: unknown;
  getParent?(info: HostComponentInfo): ContextId;
}

/**
 * 某个上下文（ContextId）下的实例记录：
 * - `instance`：实例本体
 * - `isResolved`：实例是否已完成解析（依赖注入完毕）
 * - `isPending`：是否有正在进行的实例化 Promise
 * - `donePromise`：实例化完成的 Promise（供并发请求等待）
 * - `isConstructorCalled`：构造函数是否已被真正调用
 */
export interface InstancePerContext<T> {
  instance: T;
  isResolved?: boolean;
  isPending?: boolean;
  donePromise?: Promise<unknown>;
  isConstructorCalled?: boolean;
}

/**
 * 属性注入元数据：通过 @Inject 装饰在属性上的依赖（key + 对应的实例包装器）
 */
export interface PropertyMetadata {
  key: symbol | string;
  wrapper: InstanceWrapper;
}

/**
 * 实例元数据存储：记录 wrapper 的三类依赖关系，
 * 供依赖树静态/持久（durable）判断与实例化流程使用。
 */
interface InstanceMetadataStore {
  dependencies?: InstanceWrapper[];
  properties?: PropertyMetadata[];
  enhancers?: InstanceWrapper[];
}

/**
 * 实例包装器：NestJS DI 系统中最核心的数据结构
 *
 * Module 中登记的每个 provider/controller/增强器都会被包装为一个 InstanceWrapper，
 * 它同时承载：
 * 1. **静态元数据**：token、metatype（类或工厂函数）、作用域（scope）、durable 标志等
 * 2. **实例缓存**：按 ContextId（请求上下文）缓存的实例表（WeakMap），
 *    静态作用域实例存放在 STATIC_CONTEXT 下；transient 实例则按 inquirer 再分桶
 * 3. **依赖元数据**：构造参数依赖、属性依赖、增强器（用于构建依赖树并执行注入）
 * 4. **依赖树推断**：isDependencyTreeStatic / isDependencyTreeDurable 用于
 *    判断整棵依赖子树是否静态，从而决定请求作用域实例如何克隆（cloneStaticInstance）
 *
 * @typeParam T - 被包装实例的类型
 */
export class InstanceWrapper<T = any> {
  /** provider/类名（用于日志与调试） */
  public readonly name: any;
  /** 注入 token（类引用、字符串或 Symbol） */
  public readonly token: InjectionToken;
  /** 实例是否为异步（值 provider 传入 Promise 时为 true） */
  public readonly async?: boolean;
  /** 宿主模块引用 */
  public readonly host?: Module;
  /** 是否为 useExisting 别名 wrapper */
  public readonly isAlias: boolean = false;
  /** 增强器子类型（GUARD/INTERCEPTOR/PIPE/FILTER） */
  public readonly subtype?: EnhancerSubtype;
  /** 实例作用域（DEFAULT/REQUEST/TRANSIENT 等） */
  public scope?: Scope = Scope.DEFAULT;
  /** 元类型：类引用或工厂函数；值 provider 为 null */
  public metatype: Type<T> | Function | null;
  /** 工厂 provider 的依赖列表（useFactory 的 inject 数组） */
  public inject?: FactoryProvider['inject'] | null;
  /** 是否通过 forwardRef 循环引用注册 */
  public forwardRef?: boolean;
  /** 是否为持久（durable）实例：请求作用域下跨请求复用 */
  public durable?: boolean;
  /** 实例初始化耗时（毫秒，用于性能统计） */
  public initTime?: number;
  /** 实例化完成的信号对象（供并发请求等待同一份 Promise） */
  public settlementSignal?: SettlementSignal;

  private static logger: LoggerService = new Logger(InstanceWrapper.name);

  /** 实例缓存表：ContextId -> 该上下文下的实例记录 */
  private readonly values = new WeakMap<ContextId, InstancePerContext<T>>();
  /** 依赖元数据存储（构造参数/属性/增强器） */
  private readonly [INSTANCE_METADATA_SYMBOL]: InstanceMetadataStore = {};
  /** wrapper 唯一 ID */
  private readonly [INSTANCE_ID_SYMBOL]: string;
  /**
   * transient 实例的分桶缓存：inquirerId -> (ContextId -> 实例记录)。
   * transient 实例不仅按请求上下文隔离，还按"询问者"隔离，
   * 不同宿主注入同一 transient provider 时会得到不同实例。
   */
  private transientMap?:
    | Map<string, WeakMap<ContextId, InstancePerContext<T>>>
    | undefined;
  /** 依赖树是否为静态（懒推断缓存） */
  private isTreeStatic: boolean | undefined;
  /** 依赖树是否为 durable（懒推断缓存） */
  private isTreeDurable: boolean | undefined;
  /**
   * The root inquirer reference. Present only if child instance wrapper
   * is transient and has a parent inquirer.
   */
  private rootInquirer: InstanceWrapper | undefined;

  /**
   * 创建实例包装器
   *
   * @param metadata - 包装器元数据（静态字段 + 初始实例记录的混合体）
   */
  constructor(
    metadata: Partial<InstanceWrapper<T>> & Partial<InstancePerContext<T>> = {},
  ) {
    this.initialize(metadata);
    this[INSTANCE_ID_SYMBOL] =
      metadata[INSTANCE_ID_SYMBOL] ?? this.generateUuid();
  }

  /** 获取包装器唯一 ID */
  get id(): string {
    return this[INSTANCE_ID_SYMBOL];
  }

  /** 写入静态上下文（STATIC_CONTEXT）下的实例 */
  set instance(value: T) {
    this.values.set(STATIC_CONTEXT, { instance: value });
  }

  /** 读取静态上下文下的实例（单例默认走这里） */
  get instance(): T {
    const instancePerContext = this.getInstanceByContextId(STATIC_CONTEXT);
    return instancePerContext.instance;
  }

  /**
   * 是否"非元类型"wrapper：没有 metatype（值/别名 provider）或为工厂 provider，
   * 这类 wrapper 无法直接 new，实例化逻辑需要特殊处理。
   */
  get isNotMetatype(): boolean {
    return !this.metatype || this.isFactory;
  }

  /** 是否为工厂 provider（有 metatype 且 inject 依赖列表非空） */
  get isFactory(): boolean {
    return !!this.metatype && !isNil(this.inject);
  }

  /** 是否为 transient 作用域（每次注入创建新实例） */
  get isTransient(): boolean {
    return this.scope === Scope.TRANSIENT;
  }

  /**
   * 按上下文 ID 获取实例记录
   *
   * 处理流程：
   * 1. transient 作用域且指定了询问者 ID 时，转到按 inquirer 分桶查找
   * 2. 命中缓存则直接返回
   * 3. 未命中且非静态上下文时，从静态实例克隆出该上下文的实例记录
   * 4. 静态上下文未命中时返回空记录
   *
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 询问者（宿主）ID，仅 transient 场景使用
   * @returns 该上下文下的实例记录
   */
  public getInstanceByContextId(
    contextId: ContextId,
    inquirerId?: string,
  ): InstancePerContext<T> {
    if (this.scope === Scope.TRANSIENT && inquirerId) {
      return this.getInstanceByInquirerId(contextId, inquirerId);
    }
    const instancePerContext = this.values.get(contextId);
    return instancePerContext
      ? instancePerContext
      : contextId !== STATIC_CONTEXT
        ? this.cloneStaticInstance(contextId)
        : {
            instance: null as T,
            isResolved: true,
            isPending: false,
          };
  }

  /**
   * 按"询问者 ID + 上下文 ID"获取 transient 实例记录
   *
   * transient 实例按两级键缓存：先按 inquirerId 取出分桶 WeakMap，
   * 再按 contextId 取实例；未命中时克隆一份新的 transient 实例。
   *
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 询问者（宿主）ID
   * @returns 对应的实例记录
   */
  public getInstanceByInquirerId(
    contextId: ContextId,
    inquirerId: string,
  ): InstancePerContext<T> {
    let collectionPerContext = this.transientMap!.get(inquirerId);
    if (!collectionPerContext) {
      collectionPerContext = new WeakMap();
      this.transientMap!.set(inquirerId, collectionPerContext);
    }
    const instancePerContext = collectionPerContext.get(contextId);
    return instancePerContext
      ? instancePerContext
      : this.cloneTransientInstance(contextId, inquirerId);
  }

  /**
   * 写入指定上下文下的实例记录（transient + 指定 inquirer 时转发到分桶写入）
   *
   * @param contextId - 请求上下文 ID
   * @param value - 实例记录
   * @param inquirerId - 询问者 ID（可选）
   */
  public setInstanceByContextId(
    contextId: ContextId,
    value: InstancePerContext<T>,
    inquirerId?: string,
  ) {
    if (this.scope === Scope.TRANSIENT && inquirerId) {
      return this.setInstanceByInquirerId(contextId, inquirerId, value);
    }
    this.values.set(contextId, value);
  }

  /**
   * 按"询问者 ID + 上下文 ID"写入 transient 实例记录
   *
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 询问者 ID
   * @param value - 实例记录
   */
  public setInstanceByInquirerId(
    contextId: ContextId,
    inquirerId: string,
    value: InstancePerContext<T>,
  ) {
    let collection = this.transientMap!.get(inquirerId);
    if (!collection) {
      collection = new WeakMap();
      this.transientMap!.set(inquirerId, collection);
    }
    collection.set(contextId, value);
  }

  /**
   * 移除指定上下文下的实例记录（请求结束时清理，防止内存泄漏）
   *
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 询问者 ID（可选，transient 场景使用）
   */
  public removeInstanceByContextId(contextId: ContextId, inquirerId?: string) {
    if (this.scope === Scope.TRANSIENT && inquirerId) {
      return this.removeInstanceByInquirerId(contextId, inquirerId);
    }
    this.values.delete(contextId);
  }

  /**
   * 按"询问者 ID + 上下文 ID"移除 transient 实例记录
   *
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 询问者 ID
   */
  public removeInstanceByInquirerId(contextId: ContextId, inquirerId: string) {
    const collection = this.transientMap!.get(inquirerId);
    if (!collection) {
      return;
    }
    collection.delete(contextId);
  }

  /**
   * 记录构造参数依赖：第 index 个构造参数对应的实例包装器
   * （由 Injector 在解析构造函数参数时调用）
   *
   * @param index - 构造参数下标
   * @param wrapper - 参数对应的实例包装器
   */
  public addCtorMetadata(index: number, wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].dependencies) {
      this[INSTANCE_METADATA_SYMBOL].dependencies = [];
    }
    this[INSTANCE_METADATA_SYMBOL].dependencies[index] = wrapper;
  }

  /** 获取构造参数依赖的包装器列表（按参数下标排列） */
  public getCtorMetadata(): InstanceWrapper[] {
    return this[INSTANCE_METADATA_SYMBOL].dependencies!;
  }

  /**
   * 记录一条属性注入依赖（@Inject 装饰的属性）
   *
   * @param key - 属性名
   * @param wrapper - 属性对应的实例包装器
   */
  public addPropertiesMetadata(key: symbol | string, wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].properties) {
      this[INSTANCE_METADATA_SYMBOL].properties = [];
    }
    this[INSTANCE_METADATA_SYMBOL].properties.push({
      key,
      wrapper,
    });
  }

  /** 获取属性注入依赖的元数据列表 */
  public getPropertiesMetadata(): PropertyMetadata[] {
    return this[INSTANCE_METADATA_SYMBOL].properties!;
  }

  /**
   * 追加一条增强器元数据（本实例上应用的 guard/interceptor/pipe/filter）
   *
   * @param wrapper - 增强器的实例包装器
   */
  public addEnhancerMetadata(wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].enhancers) {
      this[INSTANCE_METADATA_SYMBOL].enhancers = [];
    }
    this[INSTANCE_METADATA_SYMBOL].enhancers.push(wrapper);
  }

  /** 获取本实例上应用的所有增强器包装器 */
  public getEnhancersMetadata(): InstanceWrapper[] {
    return this[INSTANCE_METADATA_SYMBOL].enhancers!;
  }

  /**
   * 判断整棵依赖树是否为 durable（持久）。
   *
   * durable 是请求作用域的优化：若请求作用域实例的依赖树中
   * 不含任何"非静态且非 durable"的节点，则其实例可以跨请求复用。
   * 结果会被缓存（isTreeDurable），首次推断时递归遍历依赖树。
   *
   * @param lookupRegistry - 已访问节点的注册表（防止循环依赖导致无限递归）
   * @returns 依赖树是否 durable
   */
  public isDependencyTreeDurable(lookupRegistry: string[] = []): boolean {
    if (!isUndefined(this.isTreeDurable)) {
      return this.isTreeDurable;
    }
    if (this.scope === Scope.REQUEST) {
      this.isTreeDurable = this.durable === undefined ? false : this.durable;
      if (this.isTreeDurable) {
        this.printIntrospectedAsDurable();
      }
      return this.isTreeDurable;
    }
    const isStatic = this.isDependencyTreeStatic();
    if (isStatic) {
      return false;
    }

    const isTreeNonDurable = this.introspectDepsAttribute(
      (collection, registry) =>
        collection.some(
          (item: InstanceWrapper) =>
            !item.isDependencyTreeStatic() &&
            !item.isDependencyTreeDurable(registry),
        ),
      lookupRegistry,
    );
    this.isTreeDurable = !isTreeNonDurable;
    if (this.isTreeDurable) {
      this.printIntrospectedAsDurable();
    }
    return this.isTreeDurable;
  }

  /**
   * 遍历依赖树（构造参数、属性注入、增强器三类依赖）并执行回调
   *
   * 用于 static/durable 树推断：回调对每一层依赖集合返回布尔值，
   * 任一层返回 true 即短路返回。通过 lookupRegistry 记录访问路径避免环。
   *
   * @param callback - 对每层依赖集合执行的判断回调
   * @param lookupRegistry - 已访问节点注册表（防循环）
   * @returns 任一层回调为 true 则返回 true，否则 false
   */
  public introspectDepsAttribute(
    callback: (
      collection: InstanceWrapper[],
      lookupRegistry: string[],
    ) => boolean,
    lookupRegistry: string[] = [],
  ): boolean {
    if (lookupRegistry.includes(this[INSTANCE_ID_SYMBOL])) {
      return false;
    }
    lookupRegistry = lookupRegistry.concat(this[INSTANCE_ID_SYMBOL]);

    const { dependencies, properties, enhancers } =
      this[INSTANCE_METADATA_SYMBOL];

    let introspectionResult = dependencies
      ? callback(dependencies, lookupRegistry)
      : false;

    if (introspectionResult || !(properties || enhancers)) {
      return introspectionResult;
    }
    introspectionResult = properties
      ? callback(
          properties.map(item => item.wrapper),
          lookupRegistry,
        )
      : false;
    if (introspectionResult || !enhancers) {
      return introspectionResult;
    }
    return enhancers ? callback(enhancers, lookupRegistry) : false;
  }

  /**
   * 判断整棵依赖树是否为静态（不含任何请求作用域节点）。
   *
   * 若自身为 REQUEST 作用域则树必然非静态；否则递归检查所有依赖，
   * 只要有一个依赖的树非静态，本树即非静态。结果缓存于 isTreeStatic。
   *
   * @param lookupRegistry - 已访问节点注册表（防止循环依赖）
   * @returns 依赖树是否静态
   */
  public isDependencyTreeStatic(lookupRegistry: string[] = []): boolean {
    if (!isUndefined(this.isTreeStatic)) {
      return this.isTreeStatic;
    }
    if (this.scope === Scope.REQUEST) {
      this.isTreeStatic = false;
      this.printIntrospectedAsRequestScoped();
      return this.isTreeStatic;
    }
    this.isTreeStatic = !this.introspectDepsAttribute(
      (collection, registry) =>
        collection.some(
          (item: InstanceWrapper) => !item.isDependencyTreeStatic(registry),
        ),
      lookupRegistry,
    );
    if (!this.isTreeStatic) {
      this.printIntrospectedAsRequestScoped();
    }
    return this.isTreeStatic;
  }

  /**
   * 为新的请求上下文克隆静态实例的"壳"
   *
   * 处理流程：
   * 1. 若整棵依赖树是静态的，直接返回静态实例（无需克隆，全局共享）
   * 2. 否则创建新的实例记录（未解析、未挂起），并基于原型创建空实例对象
   *    ——先给实例一个原型链（Object.create(metatype.prototype)），
   *    使属性注入在构造函数调用前也能工作
   * 3. 将新记录写入该上下文的缓存
   *
   * @param contextId - 请求上下文 ID
   * @returns 新上下文下的实例记录
   */
  public cloneStaticInstance(contextId: ContextId): InstancePerContext<T> {
    const staticInstance = this.getInstanceByContextId(STATIC_CONTEXT);
    if (this.isDependencyTreeStatic()) {
      return staticInstance;
    }
    const instancePerContext: InstancePerContext<T> = {
      ...staticInstance,
      instance: undefined!,
      isResolved: false,
      isPending: false,
    };
    if (this.isNewable()) {
      instancePerContext.instance = Object.create(this.metatype!.prototype);
    }
    this.setInstanceByContextId(contextId, instancePerContext);
    return instancePerContext;
  }

  /**
   * 为 transient 实例克隆新壳（按 inquirerId 分桶写入缓存），
   * 逻辑与 cloneStaticInstance 类似，但不做静态树短路。
   *
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 询问者（宿主）ID
   * @returns 新的实例记录
   */
  public cloneTransientInstance(
    contextId: ContextId,
    inquirerId: string,
  ): InstancePerContext<T> {
    const staticInstance = this.getInstanceByContextId(STATIC_CONTEXT);
    const instancePerContext: InstancePerContext<T> = {
      ...staticInstance,
      instance: undefined!,
      isResolved: false,
      isPending: false,
    };
    if (this.isNewable()) {
      instancePerContext.instance = Object.create(this.metatype!.prototype);
    }
    this.setInstanceByInquirerId(contextId, inquirerId, instancePerContext);
    return instancePerContext;
  }

  /**
   * 为指定上下文创建实例的原型对象（构造函数调用前的"半成品"实例）
   * 仅在可实例化且该上下文实例尚未解析时创建。
   *
   * @param contextId - 请求上下文 ID
   * @returns 基于元类型原型创建的空对象；不满足条件时返回 undefined
   */
  public createPrototype(contextId: ContextId) {
    const host = this.getInstanceByContextId(contextId);
    if (!this.isNewable() || host.isResolved) {
      return;
    }
    return Object.create(this.metatype!.prototype);
  }

  /**
   * 判断当前是否处于请求作用域解析场景
   * （依赖树非静态 + 非静态上下文 + 非 transient 或有明确询问者）
   *
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者的实例包装器（可选）
   * @returns 处于请求作用域时返回 true
   */
  public isInRequestScope(
    contextId: ContextId,
    inquirer?: InstanceWrapper,
  ): boolean {
    const isDependencyTreeStatic = this.isDependencyTreeStatic();

    return (
      !isDependencyTreeStatic &&
      contextId !== STATIC_CONTEXT &&
      (!this.isTransient || (this.isTransient && !!inquirer))
    );
  }

  /**
   * 判断是否为"惰性 transient"场景：自身依赖树是静态的 transient 实例，
   * 被一个请求作用域的宿主询问 —— 此时需要为该宿主按请求克隆实例。
   *
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者的实例包装器
   * @returns 属于惰性 transient 场景时返回 true
   */
  public isLazyTransient(
    contextId: ContextId,
    inquirer: InstanceWrapper | undefined,
  ): boolean {
    const isInquirerRequestScoped = !!(
      inquirer && !inquirer.isDependencyTreeStatic()
    );

    return (
      this.isDependencyTreeStatic() &&
      contextId !== STATIC_CONTEXT &&
      this.isTransient &&
      isInquirerRequestScoped
    );
  }

  /**
   * 判断是否被"显式请求"：自身被直接解析（inquirer === this），
   * 或被一个 transient 宿主询问（MODULE_REF resolve 场景），
   * 此时即便依赖树是静态的，也需要在当前上下文中实例化。
   *
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者的实例包装器（可选）
   * @returns 被显式请求时返回 true
   */
  public isExplicitlyRequested(
    contextId: ContextId,
    inquirer?: InstanceWrapper,
  ): boolean {
    const isSelfRequested = inquirer === this;
    return (
      this.isDependencyTreeStatic() &&
      contextId !== STATIC_CONTEXT &&
      (isSelfRequested || !!(inquirer && inquirer.scope === Scope.TRANSIENT))
    );
  }

  /**
   * 判断在当前上下文下是否可以复用静态（全局共享）实例。
   *
   * 满足"依赖树静态 + 静态上下文"的前提下，还需处理 transient 的特殊情况：
   * - 非 transient provider：直接复用静态实例
   * - transient 但询问者非请求作用域（如 DEFAULT -> TRANSIENT）
   * - 嵌套 transient 且根询问者非 transient（DEFAULT -> TRANSIENT -> TRANSIENT）
   * - 初始实例化阶段的嵌套 transient（rootInquirer 尚未设置）
   * 以上情形均视为静态，共享同一实例。
   *
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者的实例包装器
   * @returns 可作为静态实例复用时返回 true
   */
  public isStatic(
    contextId: ContextId,
    inquirer: InstanceWrapper | undefined,
  ): boolean {
    if (!this.isDependencyTreeStatic() || contextId !== STATIC_CONTEXT) {
      return false;
    }

    // Non-transient provider in static context
    if (!this.isTransient) {
      return true;
    }

    const isInquirerRequestScoped =
      inquirer && !inquirer.isDependencyTreeStatic();
    const isStaticTransient = this.isTransient && !isInquirerRequestScoped;
    const rootInquirer = inquirer?.getRootInquirer();

    // Transient provider inquired by non-transient (e.g., DEFAULT -> TRANSIENT)
    if (isStaticTransient && inquirer && !inquirer.isTransient) {
      return true;
    }

    // Nested transient with non-transient root (e.g., DEFAULT -> TRANSIENT -> TRANSIENT)
    if (isStaticTransient && rootInquirer && !rootInquirer.isTransient) {
      return true;
    }

    // Nested transient during initial instantiation (rootInquirer not yet set)
    if (isStaticTransient && inquirer?.isTransient && !rootInquirer) {
      return true;
    }

    return false;
  }

  /**
   * 为 transient wrapper 记录根询问者（rootInquirer）
   * 用于嵌套 transient 场景判断整条注入链的静态性。
   * 仅当自身是 transient 时才记录。
   *
   * @param inquirer - 询问者的实例包装器
   */
  public attachRootInquirer(inquirer: InstanceWrapper) {
    if (!this.isTransient) {
      // Only attach root inquirer if the instance wrapper is transient
      return;
    }
    this.rootInquirer = inquirer.getRootInquirer() ?? inquirer;
  }

  /** 获取根询问者（仅嵌套 transient 场景存在） */
  getRootInquirer(): InstanceWrapper | undefined {
    return this.rootInquirer;
  }

  /**
   * 获取静态上下文下的所有 transient 实例
   * （只返回构造函数已被真正调用的记录，避免对未实例化的
   * transient 服务误触发生命周期钩子）
   */
  public getStaticTransientInstances() {
    if (!this.transientMap) {
      return [];
    }
    const instances = [...this.transientMap.values()];
    return iterate(instances)
      .map(item => item.get(STATIC_CONTEXT))
      .filter(item => {
        // Only return items where constructor has been actually called
        // This prevents calling lifecycle hooks on non-instantiated transient services
        return !!(item && item.isConstructorCalled);
      })
      .toArray();
  }

  /**
   * 用新的 provider 定义合并覆盖当前包装器（Hot Replace 场景）
   *
   * - 值 provider：清空 metatype/inject，重置作用域并直接写入实例
   * - 类 provider：将 metatype 替换为新的 useClass
   * - 工厂 provider：将 metatype 替换为新的 useFactory 并更新 inject
   *
   * @param provider - 新的 provider 定义
   */
  public mergeWith(provider: Provider) {
    if (isValueProvider(provider)) {
      this.metatype = null;
      this.inject = null;

      this.scope = Scope.DEFAULT;

      this.setInstanceByContextId(STATIC_CONTEXT, {
        instance: provider.useValue,
        isResolved: true,
        isPending: false,
      });
    } else if (isClassProvider(provider)) {
      this.inject = null;
      this.metatype = provider.useClass;
    } else if (isFactoryProvider(provider)) {
      this.metatype = provider.useFactory;
      this.inject = provider.inject || [];
    }
  }

  /** 判断是否可实例化：非工厂 provider 且 metatype 是带原型的类 */
  private isNewable(): boolean {
    return isNil(this.inject) && this.metatype && this.metatype.prototype;
  }

  /**
   * 初始化包装器：将元数据拷贝到实例上，
   * 并把传入的 instance/isResolved 写入静态上下文缓存；
   * 若作用域为 transient，则同时初始化分桶缓存表。
   */
  private initialize(
    metadata: Partial<InstanceWrapper<T>> & Partial<InstancePerContext<T>>,
  ) {
    const { instance, isResolved, ...wrapperPartial } = metadata;
    Object.assign(this, wrapperPartial);

    this.setInstanceByContextId(STATIC_CONTEXT, {
      instance: instance as T,
      isResolved,
    });
    this.scope === Scope.TRANSIENT && (this.transientMap = new Map());
  }

  /** 调试模式下打印"该实例被推断为 request-scoped"的日志 */
  private printIntrospectedAsRequestScoped() {
    if (!this.isDebugMode() || this.name === 'REQUEST') {
      return;
    }
    if (isString(this.name)) {
      InstanceWrapper.logger.log(
        `${clc.cyanBright(this.name)}${clc.green(
          ' introspected as ',
        )}${clc.magentaBright('request-scoped')}`,
      );
    }
  }

  /** 调试模式下打印"该实例被推断为 durable"的日志 */
  private printIntrospectedAsDurable() {
    if (!this.isDebugMode()) {
      return;
    }
    if (isString(this.name)) {
      InstanceWrapper.logger.log(
        `${clc.cyanBright(this.name)}${clc.green(
          ' introspected as ',
        )}${clc.magentaBright('durable')}`,
      );
    }
  }

  /** 是否处于调试模式（由环境变量 NEST_DEBUG 控制） */
  private isDebugMode(): boolean {
    return !!process.env.NEST_DEBUG;
  }

  /**
   * 生成包装器唯一 ID：以"名称/token + 宿主模块名"为种子生成确定性 UUID，
   * 无种子时使用随机字符串。
   */
  private generateUuid(): string {
    let key = this.name?.toString() ?? this.token?.toString();
    key += this.host?.name ?? '';

    return key ? UuidFactory.get(key) : randomStringGenerator();
  }
}
