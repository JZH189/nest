import {
  EnhancerSubtype,
  ENTRY_PROVIDER_WATERMARK,
} from '@nestjs/common/constants';
import {
  ClassProvider,
  Controller,
  DynamicModule,
  ExistingProvider,
  FactoryProvider,
  Injectable,
  InjectionToken,
  NestModule,
  Provider,
  Scope,
  Type,
  ValueProvider,
} from '@nestjs/common/interfaces';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import {
  isFunction,
  isNil,
  isObject,
  isString,
  isSymbol,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { ApplicationConfig } from '../application-config';
import {
  InvalidClassException,
  RuntimeException,
  UnknownExportException,
} from '../errors/exceptions';
import { createContextId } from '../helpers/context-id-factory';
import { getClassScope } from '../helpers/get-class-scope';
import { isDurable } from '../helpers/is-durable';
import { UuidFactory } from '../inspector/uuid-factory';
import { CONTROLLER_ID_KEY } from './constants';
import { NestContainer } from './container';
import { ContextId, InstanceWrapper } from './instance-wrapper';
import { ModuleRef, ModuleRefGetOrResolveOpts } from './module-ref';

/**
 * 模块在 IoC 容器中的运行时表示
 *
 * 每个通过 @Module() 声明（或动态模块）在容器中注册后，都会对应一个 Module 实例。
 * 它维护模块内部的五张"表"：
 * 1. **_providers**：本模块注册的 provider（含模块自身、ModuleRef、ApplicationConfig）
 * 2. **_injectables**：增强器类可注入对象（guard/interceptor/pipe/filter）
 * 3. **_middlewares**：中间件
 * 4. **_controllers**：控制器
 * 5. **_imports / _exports**：模块图的边（导入的模块集合与导出的 token 集合）
 *
 * 每个 provider/controller 注册后都会被包装为 InstanceWrapper（承载实例缓存与作用域信息）。
 * 实例的创建本身由 Injector 与 InstanceLoader 驱动，Module 只负责登记与查找。
 */
export class Module {
  /** 模块实例的唯一 ID（由 token 或模块名生成的确定性 UUID） */
  private readonly _id: string;
  /** 导入的模块集合（模块图的出边） */
  private readonly _imports = new Set<Module>();
  /** provider 表：注入 token -> 实例包装器 */
  private readonly _providers = new Map<
    InjectionToken,
    InstanceWrapper<Injectable>
  >();
  /** 增强器表：guard/interceptor 等可注入对象 -> 实例包装器 */
  private readonly _injectables = new Map<
    InjectionToken,
    InstanceWrapper<Injectable>
  >();
  /** 中间件表 */
  private readonly _middlewares = new Map<
    InjectionToken,
    InstanceWrapper<Injectable>
  >();
  /** controller 表：controller 类 -> 实例包装器 */
  private readonly _controllers = new Map<
    InjectionToken,
    InstanceWrapper<Controller>
  >();
  /** 入口 provider 集合（标记 @EntryProvider 的 provider，优先实例化） */
  private readonly _entryProviderKeys = new Set<InjectionToken>();
  /** 导出的 token 集合（允许被其他导入本模块的模块使用） */
  private readonly _exports = new Set<InjectionToken>();

  /** 模块在模块图中的距离（用于生命周期钩子的初始化排序） */
  private _distance = 0;
  /** 是否在 preview 模式下提前初始化 */
  private _initOnPreview = false;
  /** 是否为全局模块 */
  private _isGlobal = false;
  /** 模块的唯一 token（由 ModuleCompiler 生成的字符串） */
  private _token: string;

  /**
   * 创建模块实例
   *
   * @param _metatype - 模块类（@Module() 装饰的类）
   * @param container - 所属的 IoC 容器引用
   */
  constructor(
    private readonly _metatype: Type<any>,
    private readonly container: NestContainer,
  ) {
    this.addCoreProviders();
    this._id = this.generateUuid();
  }

  /** 获取模块唯一 ID */
  get id(): string {
    return this._id;
  }

  /** 获取模块 token */
  get token(): string {
    return this._token;
  }

  /** 设置模块 token（由 NestContainer#setModule 在编译后回填） */
  set token(token: string) {
    this._token = token;
  }

  /** 获取模块类名 */
  get name() {
    return this.metatype.name;
  }

  /** 是否为全局模块 */
  get isGlobal() {
    return this._isGlobal;
  }

  /** 设置全局模块标志 */
  set isGlobal(global: boolean) {
    this._isGlobal = global;
  }

  /** 是否在 preview 模式下提前初始化 */
  get initOnPreview() {
    return this._initOnPreview;
  }

  /** 设置 preview 预初始化标志 */
  set initOnPreview(initOnPreview: boolean) {
    this._initOnPreview = initOnPreview;
  }

  /** 获取 provider 表（只读访问） */
  get providers(): Map<InjectionToken, InstanceWrapper<Injectable>> {
    return this._providers;
  }

  /** 获取中间件表 */
  get middlewares(): Map<InjectionToken, InstanceWrapper<Injectable>> {
    return this._middlewares;
  }

  /** 获取导入的模块集合 */
  get imports(): Set<Module> {
    return this._imports;
  }

  /** 获取增强器表 */
  get injectables(): Map<InjectionToken, InstanceWrapper<Injectable>> {
    return this._injectables;
  }

  /** 获取 controller 表 */
  get controllers(): Map<InjectionToken, InstanceWrapper<Controller>> {
    return this._controllers;
  }

  /** 获取入口 provider 的实例包装器数组（按注册顺序） */
  get entryProviders(): Array<InstanceWrapper<Injectable>> {
    return Array.from(this._entryProviderKeys).map(
      token => this.providers.get(token)!,
    );
  }

  /** 获取导出的 token 集合 */
  get exports(): Set<InjectionToken> {
    return this._exports;
  }

  /**
   * 获取模块自身的实例（即模块类被实例化后的对象）
   *
   * @throws RuntimeException - 模块自身尚未作为 provider 注册时抛出
   */
  get instance(): NestModule {
    if (!this._providers.has(this._metatype)) {
      throw new RuntimeException();
    }
    const moduleRef = this._providers.get(this._metatype);
    return moduleRef!.instance as NestModule;
  }

  /** 获取模块类（元类型） */
  get metatype(): Type<any> {
    return this._metatype;
  }

  /** 获取模块在模块图中的距离 */
  get distance(): number {
    return this._distance;
  }

  /** 设置模块在模块图中的距离 */
  set distance(value: number) {
    this._distance = value;
  }

  /**
   * 注册模块自带的三个核心 provider：
   * 模块自身、ModuleRef、ApplicationConfig
   */
  public addCoreProviders() {
    this.addModuleAsProvider();
    this.addModuleRef();
    this.addApplicationConfig();
  }

  /**
   * 注册 ModuleRef provider
   *
   * 通过 createModuleReferenceType 动态创建一个绑定到本模块的 ModuleRef 子类，
   * 使模块内注入 ModuleRef 时默认以"严格模式"在本模块范围内解析依赖。
   */
  public addModuleRef() {
    const moduleRef = this.createModuleReferenceType();
    this._providers.set(
      ModuleRef,
      new InstanceWrapper({
        token: ModuleRef,
        name: ModuleRef.name,
        metatype: ModuleRef as any,
        isResolved: true,
        instance: new moduleRef(),
        host: this,
      }),
    );
  }

  /**
   * 将模块自身注册为 provider（使模块类可被注入，如注入模块配置）
   * 初始 isResolved 为 false，实例由 InstanceLoader 稍后创建。
   */
  public addModuleAsProvider() {
    this._providers.set(
      this._metatype,
      new InstanceWrapper({
        token: this._metatype,
        name: this._metatype.name,
        metatype: this._metatype,
        isResolved: false,
        instance: null,
        host: this,
      }),
    );
  }

  /**
   * 注册 ApplicationConfig provider（实例直接复用容器中的应用配置，视为已解析）
   */
  public addApplicationConfig() {
    this._providers.set(
      ApplicationConfig,
      new InstanceWrapper({
        token: ApplicationConfig,
        name: ApplicationConfig.name,
        isResolved: true,
        instance: this.container.applicationConfig,
        host: this,
      }),
    );
  }

  /**
   * 向本模块注册一个增强器类可注入对象（guard/interceptor/pipe/filter）
   *
   * 处理流程：
   * 1. 自定义 provider（带 provide 字段）直接登记到 _injectables 表
   * 2. 普通类：若尚未注册，创建 InstanceWrapper（记录作用域、durable、增强器子类型）
   * 3. 若指定了 host（宿主 controller/provider），则向宿主包装器追加增强器元数据
   *    （运行时按此元数据在宿主方法调用前后应用增强器）
   *
   * @param injectable - 可注入对象定义
   * @param enhancerSubtype - 增强器子类型（GUARD/INTERCEPTOR 等）
   * @param host - 可选的宿主类
   * @returns 注册后的实例包装器
   */
  public addInjectable<T extends Injectable>(
    injectable: Provider,
    enhancerSubtype: EnhancerSubtype,
    host?: Type<T>,
  ) {
    if (this.isCustomProvider(injectable)) {
      return this.addCustomProvider(
        injectable,
        this._injectables,
        enhancerSubtype,
      );
    }
    let instanceWrapper = this.injectables.get(injectable);
    if (!instanceWrapper) {
      instanceWrapper = new InstanceWrapper({
        token: injectable,
        name: injectable.name,
        metatype: injectable,
        instance: null,
        isResolved: false,
        scope: getClassScope(injectable),
        durable: isDurable(injectable),
        subtype: enhancerSubtype,
        host: this,
      });
      this._injectables.set(injectable, instanceWrapper);
    }
    if (host) {
      const hostWrapper =
        this._controllers.get(host) || this._providers.get(host);
      hostWrapper && hostWrapper.addEnhancerMetadata(instanceWrapper);
    }
    return instanceWrapper;
  }

  /**
   * 向本模块注册一个 provider（重载声明 + 实现）
   *
   * 处理流程：
   * 1. 自定义 provider（useClass/useValue/useFactory/useExisting）：记录入口
   *    provider 标记后转交 addCustomProvider 分发处理
   * 2. 普通 provider 类：transient / request 作用域且已声明过时直接返回
   *    （这两种作用域允许多次声明以生成多个实例，此处避免重复注册）
   * 3. 否则创建新的 InstanceWrapper 登记到 _providers 表，并检查是否为入口 provider
   *
   * @param provider - provider 定义
   * @param enhancerSubtype - 增强器子类型（可选）
   * @returns provider 的注入 token
   */
  public addProvider(provider: Provider): InjectionToken;
  public addProvider(
    provider: Provider,
    enhancerSubtype: EnhancerSubtype,
  ): InjectionToken;
  public addProvider(provider: Provider, enhancerSubtype?: EnhancerSubtype) {
    if (this.isCustomProvider(provider)) {
      if (this.isEntryProvider(provider.provide)) {
        this._entryProviderKeys.add(provider.provide);
      }
      return this.addCustomProvider(provider, this._providers, enhancerSubtype);
    }

    const isAlreadyDeclared = this._providers.has(provider);
    if (
      (this.isTransientProvider(provider) ||
        this.isRequestScopeProvider(provider)) &&
      isAlreadyDeclared
    ) {
      return provider;
    }

    this._providers.set(
      provider,
      new InstanceWrapper({
        token: provider,
        name: (provider as Type<Injectable>).name,
        metatype: provider as Type<Injectable>,
        instance: null,
        isResolved: false,
        scope: getClassScope(provider),
        durable: isDurable(provider),
        host: this,
      }),
    );

    if (this.isEntryProvider(provider)) {
      this._entryProviderKeys.add(provider);
    }

    return provider as Type<Injectable>;
  }

  /**
   * 判断是否为自定义 provider（即携带 provide 字段的对象形式定义）
   *
   * @param provider - 待判断的 provider
   * @returns 是自定义 provider 时类型收窄为四种自定义 provider 之一
   */
  public isCustomProvider(
    provider: Provider,
  ): provider is
    | ClassProvider
    | FactoryProvider
    | ValueProvider
    | ExistingProvider {
    return !isNil(
      (
        provider as
          | ClassProvider
          | FactoryProvider
          | ValueProvider
          | ExistingProvider
      ).provide,
    );
  }

  /**
   * 注册自定义 provider 的分发入口：按定义形式分别调用
   * addCustomClass / addCustomValue / addCustomFactory / addCustomUseExisting
   *
   * @param provider - 自定义 provider 定义
   * @param collection - 目标登记表（_providers 或 _injectables）
   * @param enhancerSubtype - 增强器子类型（可选）
   * @returns provider 的 provide token
   */
  public addCustomProvider(
    provider:
      | ClassProvider
      | FactoryProvider
      | ValueProvider
      | ExistingProvider,
    collection: Map<Function | string | symbol, any>,
    enhancerSubtype?: EnhancerSubtype,
  ) {
    if (this.isCustomClass(provider)) {
      this.addCustomClass(provider, collection, enhancerSubtype);
    } else if (this.isCustomValue(provider)) {
      this.addCustomValue(provider, collection, enhancerSubtype);
    } else if (this.isCustomFactory(provider)) {
      this.addCustomFactory(provider, collection, enhancerSubtype);
    } else if (this.isCustomUseExisting(provider)) {
      this.addCustomUseExisting(provider, collection, enhancerSubtype);
    }
    return provider.provide;
  }

  /** 判断是否为 useClass 形式的类 provider */
  public isCustomClass(provider: any): provider is ClassProvider {
    return !isUndefined((provider as ClassProvider).useClass);
  }

  /** 判断是否为 useValue 形式的值 provider */
  public isCustomValue(provider: any): provider is ValueProvider {
    return (
      isObject(provider) &&
      Object.prototype.hasOwnProperty.call(provider, 'useValue')
    );
  }

  /** 判断是否为 useFactory 形式的工厂 provider */
  public isCustomFactory(provider: any): provider is FactoryProvider {
    return !isUndefined((provider as FactoryProvider).useFactory);
  }

  /** 判断是否为 useExisting 形式的别名 provider */
  public isCustomUseExisting(provider: any): provider is ExistingProvider {
    return !isUndefined((provider as ExistingProvider).useExisting);
  }

  /** 判断导出对象是否为动态模块（携带 module 属性） */
  public isDynamicModule(exported: any): exported is DynamicModule {
    return exported && exported.module;
  }

  /**
   * 注册 useClass 形式的类 provider
   *
   * 作用域与 durable 未显式指定时，回退读取 useClass 类上的装饰器元数据。
   *
   * @param provider - 类 provider 定义
   * @param collection - 目标登记表
   * @param enhancerSubtype - 增强器子类型（可选）
   */
  public addCustomClass(
    provider: ClassProvider,
    collection: Map<InjectionToken, InstanceWrapper>,
    enhancerSubtype?: EnhancerSubtype,
  ) {
    let { scope, durable } = provider;

    const { useClass } = provider;
    if (isUndefined(scope)) {
      scope = getClassScope(useClass);
    }
    if (isUndefined(durable)) {
      durable = isDurable(useClass);
    }

    const token = provider.provide;
    collection.set(
      token,
      new InstanceWrapper({
        token,
        name: useClass?.name || useClass,
        metatype: useClass,
        instance: null,
        isResolved: false,
        scope,
        durable,
        host: this,
        subtype: enhancerSubtype,
      }),
    );
  }

  /**
   * 注册 useValue 形式的值 provider
   *
   * 值 provider 实例立即可用（isResolved: true）；
   * 若配置了 instrument.instanceDecorator，会先经过实例装饰器处理。
   *
   * @param provider - 值 provider 定义
   * @param collection - 目标登记表
   * @param enhancerSubtype - 增强器子类型（可选）
   */
  public addCustomValue(
    provider: ValueProvider,
    collection: Map<Function | string | symbol, InstanceWrapper>,
    enhancerSubtype?: EnhancerSubtype,
  ) {
    const { useValue: value, provide: providerToken } = provider;

    const instanceDecorator =
      this.container.contextOptions?.instrument?.instanceDecorator;
    collection.set(
      providerToken,
      new InstanceWrapper({
        token: providerToken,
        name: (providerToken as Function)?.name || providerToken,
        metatype: null!,
        instance: instanceDecorator ? instanceDecorator(value) : value,
        isResolved: true,
        async: value instanceof Promise,
        host: this,
        subtype: enhancerSubtype,
      }),
    );
  }

  /**
   * 注册 useFactory 形式的工厂 provider
   *
   * 工厂函数记入 metatype，其依赖列表记入 wrapper 的 inject 字段，
   * 实例在实例化阶段调用工厂函数生成。
   *
   * @param provider - 工厂 provider 定义
   * @param collection - 目标登记表
   * @param enhancerSubtype - 增强器子类型（可选）
   */
  public addCustomFactory(
    provider: FactoryProvider,
    collection: Map<Function | string | symbol, InstanceWrapper>,
    enhancerSubtype?: EnhancerSubtype,
  ) {
    const {
      useFactory: factory,
      inject,
      scope,
      durable,
      provide: providerToken,
    } = provider;

    collection.set(
      providerToken,
      new InstanceWrapper({
        token: providerToken,
        name: (providerToken as Function)?.name || providerToken,
        metatype: factory as any,
        instance: null,
        isResolved: false,
        inject: inject || [],
        scope,
        durable,
        host: this,
        subtype: enhancerSubtype,
      }),
    );
  }

  /**
   * 注册 useExisting 形式的别名 provider
   *
   * 别名 wrapper 标记 isAlias: true，并把被别名引用的 token 记入 inject，
   * 实例化时直接转发解析结果（不重复创建实例）。
   *
   * @param provider - 别名 provider 定义
   * @param collection - 目标登记表
   * @param enhancerSubtype - 增强器子类型（可选）
   */
  public addCustomUseExisting(
    provider: ExistingProvider,
    collection: Map<Function | string | symbol, InstanceWrapper>,
    enhancerSubtype?: EnhancerSubtype,
  ) {
    const { useExisting, provide: providerToken } = provider;
    collection.set(
      providerToken,
      new InstanceWrapper({
        token: providerToken,
        name: (providerToken as Function)?.name || providerToken,
        metatype: (instance => instance) as any,
        instance: null,
        isResolved: false,
        inject: [useExisting],
        host: this,
        isAlias: true,
        subtype: enhancerSubtype,
      }),
    );
  }

  /**
   * 登记一条导出声明（支持 provider 类、字符串/Symbol token、动态模块等形式）
   *
   * @param toExport - 被导出的对象
   */
  public addExportedProviderOrModule(
    toExport: Provider | string | symbol | DynamicModule,
  ) {
    const addExportedUnit = (token: InjectionToken) =>
      this._exports.add(this.validateExportedProvider(token));

    if (this.isCustomProvider(toExport as any)) {
      return this.addCustomExportedProvider(toExport as any);
    } else if (isString(toExport) || isSymbol(toExport)) {
      return addExportedUnit(toExport);
    } else if (this.isDynamicModule(toExport)) {
      const { module: moduleClassRef } = toExport;
      return addExportedUnit(moduleClassRef);
    }
    addExportedUnit(toExport as Type<any>);
  }

  /**
   * 登记自定义 provider 的导出声明（取其 provide token）
   *
   * @param provider - 自定义 provider 定义
   */
  public addCustomExportedProvider(
    provider:
      | FactoryProvider
      | ValueProvider
      | ClassProvider
      | ExistingProvider,
  ) {
    const provide = provider.provide;
    if (isString(provide) || isSymbol(provide)) {
      return this._exports.add(this.validateExportedProvider(provide));
    }
    this._exports.add(this.validateExportedProvider(provide));
  }

  /**
   * 校验导出的 token 是否合法
   *
   * 规则：token 必须是本模块的 provider，或者是本模块导入的模块（re-export），
   * 否则抛出 UnknownExportException。
   *
   * @param token - 被导出的注入 token
   * @returns 校验通过的 token
   * @throws UnknownExportException - token 既非本模块 provider 也非导入模块时抛出
   */
  public validateExportedProvider(token: InjectionToken) {
    if (this._providers.has(token)) {
      return token;
    }
    const imports = iterate(this._imports.values())
      .filter(item => !!item)
      .map(({ metatype }) => metatype)
      .filter(metatype => !!metatype)
      .toArray();

    if (!imports.includes(token as Type<unknown>)) {
      const { name } = this.metatype;
      const providerName = isFunction(token) ? (token as Function).name : token;
      throw new UnknownExportException(providerName as string, name);
    }
    return token;
  }

  /**
   * 注册一个 controller 到本模块，并为其分配唯一 ID
   * （CONTROLLER_ID_KEY 用于路由与增强器元数据关联）
   *
   * @param controller - controller 类
   */
  public addController(controller: Type<Controller>) {
    this._controllers.set(
      controller,
      new InstanceWrapper({
        token: controller,
        name: controller.name,
        metatype: controller,
        instance: null!,
        isResolved: false,
        scope: getClassScope(controller),
        durable: isDurable(controller),
        host: this,
      }),
    );

    this.assignControllerUniqueId(controller);
  }

  /**
   * 在 controller 类上定义一个不可枚举的随机唯一 ID 属性（CONTROLLER_ID_KEY）
   *
   * @param controller - controller 类
   */
  public assignControllerUniqueId(controller: Type<Controller>) {
    Object.defineProperty(controller, CONTROLLER_ID_KEY, {
      enumerable: false,
      writable: false,
      configurable: true,
      value: randomStringGenerator(),
    });
  }

  /**
   * 向本模块添加一条导入关系（模块图的边）
   *
   * @param moduleRef - 被导入的模块实例
   */
  public addImport(moduleRef: Module) {
    this._imports.add(moduleRef);
  }

  /**
   * 在本模块范围内替换 provider 或增强器（用于热替换/HMR 场景）
   *
   * @param toReplace - 待替换的注入 token
   * @param options - 替换选项（含 isProvider 标志与新的 provider 定义）
   */
  public replace(toReplace: InjectionToken, options: any) {
    if (options.isProvider && this.hasProvider(toReplace)) {
      const originalProvider = this._providers.get(toReplace);

      return originalProvider!.mergeWith({ provide: toReplace, ...options });
    } else if (!options.isProvider && this.hasInjectable(toReplace)) {
      const originalInjectable = this._injectables.get(toReplace);

      return originalInjectable!.mergeWith({
        provide: toReplace,
        ...options,
      });
    }
  }

  /** 判断本模块是否注册了指定 token 的 provider */
  public hasProvider(token: InjectionToken): boolean {
    return this._providers.has(token);
  }

  /** 判断本模块是否注册了指定 token 的增强器 */
  public hasInjectable(token: InjectionToken): boolean {
    return this._injectables.has(token);
  }

  /**
   * 按注入 token 获取 provider 的实例包装器
   *
   * @param name - 注入 token
   * @returns 对应的实例包装器（可能为 undefined）
   */
  public getProviderByKey<T = any>(
    name: InjectionToken<T>,
  ): InstanceWrapper<T> {
    return this._providers.get(name) as InstanceWrapper<T>;
  }

  /**
   * 按实例包装器 ID 查找 provider（用于 Graph Inspector / 调试）
   *
   * @param id - 实例包装器唯一 ID
   * @returns 对应的实例包装器；未找到返回 undefined
   */
  public getProviderById<T = any>(id: string): InstanceWrapper<T> | undefined {
    return Array.from(this._providers.values()).find(
      item => item.id === id,
    ) as InstanceWrapper<T>;
  }

  /**
   * 按实例包装器 ID 查找 controller
   *
   * @param id - 实例包装器唯一 ID
   * @returns 对应的实例包装器；未找到返回 undefined
   */
  public getControllerById<T = any>(
    id: string,
  ): InstanceWrapper<T> | undefined {
    return Array.from(this._controllers.values()).find(
      item => item.id === id,
    ) as InstanceWrapper<T>;
  }

  /**
   * 按实例包装器 ID 查找增强器（injectable）
   *
   * @param id - 实例包装器唯一 ID
   * @returns 对应的实例包装器；未找到返回 undefined
   */
  public getInjectableById<T = any>(
    id: string,
  ): InstanceWrapper<T> | undefined {
    return Array.from(this._injectables.values()).find(
      item => item.id === id,
    ) as InstanceWrapper<T>;
  }

  /**
   * 按实例包装器 ID 查找中间件
   *
   * @param id - 实例包装器唯一 ID
   * @returns 对应的实例包装器；未找到返回 undefined
   */
  public getMiddlewareById<T = any>(
    id: string,
  ): InstanceWrapper<T> | undefined {
    return Array.from(this._middlewares.values()).find(
      item => item.id === id,
    ) as InstanceWrapper<T>;
  }

  /**
   * 获取所有非别名（非 useExisting）的 provider 键值对
   * （实例化时别名 provider 无需独立创建实例，会被跳过）
   */
  public getNonAliasProviders(): Array<
    [InjectionToken, InstanceWrapper<Injectable>]
  > {
    return [...this._providers].filter(([_, wrapper]) => !wrapper.isAlias);
  }

  /**
   * 创建一个绑定到本模块的 ModuleRef 子类
   *
   * 每个模块注入的 ModuleRef 实际上是该工厂生成的匿名子类实例，
   * 其 get/resolve/create 方法默认以"严格模式"将解析范围限定在本模块内
   * （moduleId 绑定为 self.id），也可通过 options.strict: false 放宽为全局查找。
   *
   * @returns 绑定了宿主模块上下文的 ModuleRef 子类
   */
  public createModuleReferenceType(): Type<ModuleRef> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return class extends ModuleRef {
      constructor() {
        super(self.container);
      }

      public get<TInput = any, TResult = TInput>(
        typeOrToken: Type<TInput> | string | symbol,
        options: ModuleRefGetOrResolveOpts = {},
      ): TResult | Array<TResult> {
        options.strict ??= true;
        options.each ??= false;

        return this.find<TInput, TResult>(
          typeOrToken,
          options.strict
            ? {
                moduleId: self.id,
                each: options.each,
              }
            : options,
        );
      }

      public resolve<TInput = any, TResult = TInput>(
        typeOrToken: Type<TInput> | string | symbol,
        contextId = createContextId(),
        options: ModuleRefGetOrResolveOpts = {},
      ): Promise<TResult | Array<TResult>> {
        options.strict ??= true;
        options.each ??= false;

        return this.resolvePerContext<TInput, TResult>(
          typeOrToken,
          self,
          contextId,
          options,
        );
      }

      public async create<T = any>(
        type: Type<T>,
        contextId?: ContextId,
      ): Promise<T> {
        if (!(type && isFunction(type) && type.prototype)) {
          throw new InvalidClassException(type);
        }
        return this.instantiateClass<T>(type, self, contextId);
      }
    };
  }

  /**
   * 判断 provider 是否标记为入口 provider（@EntryProvider 装饰器）
   * 入口 provider 会在模块实例化时被优先创建。
   */
  private isEntryProvider(metatype: InjectionToken): boolean {
    return typeof metatype === 'function'
      ? !!Reflect.getMetadata(ENTRY_PROVIDER_WATERMARK, metatype)
      : false;
  }

  /**
   * 生成模块的唯一 ID：以 token（去掉算法前缀部分）或模块名为种子，
   * 通过 UuidFactory 生成确定性 UUID；无种子时使用随机字符串。
   */
  private generateUuid(): string {
    const prefix = 'M_';
    const key = this.token
      ? this.token.includes(':')
        ? this.token.split(':')[1]
        : this.token
      : this.name;

    return key ? UuidFactory.get(`${prefix}_${key}`) : randomStringGenerator();
  }

  /** 判断 provider 类是否为 transient 作用域（每次注入都创建新实例） */
  private isTransientProvider(provider: Type<any>): boolean {
    return getClassScope(provider) === Scope.TRANSIENT;
  }

  /** 判断 provider 类是否为 request 作用域（每个请求创建新实例） */
  private isRequestScopeProvider(provider: Type<any>): boolean {
    return getClassScope(provider) === Scope.REQUEST;
  }
}
