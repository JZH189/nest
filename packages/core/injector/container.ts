import { DynamicModule, Provider } from '@nestjs/common';
import {
  EnhancerSubtype,
  GLOBAL_MODULE_METADATA,
} from '@nestjs/common/constants';
import { Injectable, Type } from '@nestjs/common/interfaces';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { ApplicationConfig } from '../application-config';
import { DiscoverableMetaHostCollection } from '../discovery/discoverable-meta-host-collection';
import {
  CircularDependencyException,
  UndefinedForwardRefException,
  UnknownModuleException,
} from '../errors/exceptions';
import { InitializeOnPreviewAllowlist } from '../inspector/initialize-on-preview.allowlist';
import { SerializedGraph } from '../inspector/serialized-graph';
import { REQUEST } from '../router/request/request-constants';
import { ModuleCompiler, ModuleFactory } from './compiler';
import { ContextId } from './instance-wrapper';
import { InternalCoreModule } from './internal-core-module/internal-core-module';
import { InternalProvidersStorage } from './internal-providers-storage';
import { Module } from './module';
import { ModulesContainer } from './modules-container';
import { ByReferenceModuleOpaqueKeyFactory } from './opaque-key-factory/by-reference-module-opaque-key-factory';
import { DeepHashedModuleOpaqueKeyFactory } from './opaque-key-factory/deep-hashed-module-opaque-key-factory';
import { ModuleOpaqueKeyFactory } from './opaque-key-factory/interfaces/module-opaque-key-factory.interface';

/**
 * 模块元类型：可以是静态模块类、动态模块配置，或返回动态模块的 Promise
 */
type ModuleMetatype = Type<any> | DynamicModule | Promise<DynamicModule>;
/**
 * 模块作用域：模块在依赖扫描时的引用链（从根模块到当前模块的类列表）
 */
type ModuleScope = Type<any>[];

/**
 * NestJS IoC 容器的核心实现
 *
 * NestContainer 是整个依赖注入系统的"总账本"，持有应用的所有状态：
 * 1. **模块图**：通过 ModulesContainer 保存所有已注册模块（含模块间的 import 关系）
 * 2. **全局模块集合**：记录被 @Global() 标记或 global: true 的模块，需要在绑定期注入到所有模块
 * 3. **动态模块元数据**：按 token 缓存动态模块的配置（providers/imports/exports 等）
 * 4. **内部核心模块**：框架内部的 InternalCoreModule 引用（承载 REQUEST 等内置 provider）
 * 5. **序列化图**：用于 Inspector/Graph Inspector 输出依赖关系图
 *
 * NestApplication 与 NestApplicationContext 都基于它构建，模块、provider、controller
 * 的注册最终都会落到这里的 Module 实例上。
 */
export class NestContainer {
  /** 全局模块集合：@Global() 模块会被注入到所有其他模块的 imports 中 */
  private readonly globalModules = new Set<Module>();
  //用于存储和管理 NestJS 应用中所有已注册的模块实例。
  private readonly modules = new ModulesContainer();
  /** 动态模块元数据缓存：key 为模块 token，value 为 DynamicModule 配置（去掉 module 字段） */
  private readonly dynamicModulesMetadata = new Map<
    string,
    Partial<DynamicModule>
  >();
  /** 内置 provider 存储：httpAdapter、httpAdapterHost 等框架级单例 */
  private readonly internalProvidersStorage = new InternalProvidersStorage();
  /** 序列化后的依赖关系图，供 Graph Inspector / 可视化工具使用 */
  private readonly _serializedGraph = new SerializedGraph();
  /** 模块编译器：将模块元类型编译为 { type, token, dynamicMetadata } */
  private moduleCompiler: ModuleCompiler;
  /** 框架内部核心模块（InternalCoreModule）的引用 */
  private internalCoreModule: Module;

  constructor(
    private readonly _applicationConfig:
      | ApplicationConfig
      | undefined = undefined,
    private readonly _contextOptions:
      | NestApplicationContextOptions
      | undefined = undefined,
  ) {
    // 选择模块不透明键工厂（用于生成模块的唯一标识符）
    const moduleOpaqueKeyFactory =
      this._contextOptions?.moduleIdGeneratorAlgorithm === 'deep-hash'
        ? new DeepHashedModuleOpaqueKeyFactory() // 深度哈希策略：基于模块内容生成稳定 ID
        : new ByReferenceModuleOpaqueKeyFactory({
            // 引用策略：根据快照模式选择键生成方式
            keyGenerationStrategy: this._contextOptions?.snapshot
              ? 'shallow' // 快照模式：生成确定性 ID（用于序列化/快照）
              : 'random', // 非快照：生成随机 ID（用于热重载/开发）
          });
    //模块编译器
    this.moduleCompiler = new ModuleCompiler(moduleOpaqueKeyFactory);
  }

  /** 获取序列化的依赖关系图 */
  get serializedGraph(): SerializedGraph {
    return this._serializedGraph;
  }

  /** 获取应用配置（可能为 undefined，如仅创建 StandaloneApplicationContext 时） */
  get applicationConfig(): ApplicationConfig | undefined {
    return this._applicationConfig;
  }

  /** 获取应用上下文选项（snapshot、preview 等配置） */
  get contextOptions(): NestApplicationContextOptions | undefined {
    return this._contextOptions;
  }

  /**
   * 注册 HTTP 适配器（如 ExpressAdapter / FastifyAdapter）
   *
   * 同时将其写入 httpAdapterHost，使 HttpAdapterHost 提供的 provider 能拿到同一实例。
   *
   * @param httpAdapter - HTTP 适配器实例
   */
  public setHttpAdapter(httpAdapter: any) {
    this.internalProvidersStorage.httpAdapter = httpAdapter;

    if (!this.internalProvidersStorage.httpAdapterHost) {
      return;
    }
    const host = this.internalProvidersStorage.httpAdapterHost;
    host.httpAdapter = httpAdapter;
  }

  /** 获取当前 HTTP 适配器引用 */
  public getHttpAdapterRef() {
    return this.internalProvidersStorage.httpAdapter;
  }

  /** 获取 HttpAdapterHost 引用（承载 httpAdapter 的宿主对象） */
  public getHttpAdapterHostRef() {
    return this.internalProvidersStorage.httpAdapterHost;
  }

  /**
   * 向容器注册一个模块（若同 token 模块已存在则直接复用）
   *
   * 处理流程：
   * 1. 校验 metatype 非空（捕获 forwardRef(() => undefined) 的边界情况）
   * 2. 通过模块编译器编译出 { type, dynamicMetadata, token }
   * 3. 若容器中已有相同 token 的模块，直接返回已有引用（幂等）
   * 4. 否则调用 setModule 创建新模块并登记
   *
   * @param metatype - 模块元类型（类/动态模块/Promise 动态模块）
   * @param scope - 模块的引用链（用于错误提示与动态模块递归注册）
   * @returns 包含模块引用与是否新插入标志的对象；token 冲突时 inserted 也为 true
   */
  public async addModule(
    metatype: ModuleMetatype,
    scope: ModuleScope,
  ): Promise<
    | {
        moduleRef: Module;
        inserted: boolean;
      }
    | undefined
  > {
    // In DependenciesScanner#scanForModules we already check for undefined or invalid modules
    // We still need to catch the edge-case of `forwardRef(() => undefined)`
    if (!metatype) {
      throw new UndefinedForwardRefException(scope);
    }
    const { type, dynamicMetadata, token } =
      await this.moduleCompiler.compile(metatype);
    if (this.modules.has(token)) {
      return {
        moduleRef: this.modules.get(token)!,
        inserted: true,
      };
    }

    return {
      moduleRef: await this.setModule(
        {
          token,
          type,
          dynamicMetadata,
        },
        scope,
      ),
      inserted: true,
    };
  }

  /**
   * 用新模块替换容器中已有的模块（用于热替换 / 模块懒加载覆盖场景）
   *
   * 注意：这里复用被替换模块的 token，使所有依赖该模块的引用自然指向新模块。
   *
   * @param metatypeToReplace - 待被替换的原模块元类型（用于计算 token）
   * @param newMetatype - 新的模块元类型
   * @param scope - 模块引用链
   * @returns 包含新模块引用与 inserted（恒为 false，表示是替换而非插入）的对象
   */
  public async replaceModule(
    metatypeToReplace: ModuleMetatype,
    newMetatype: ModuleMetatype,
    scope: ModuleScope,
  ): Promise<
    | {
        moduleRef: Module;
        inserted: boolean;
      }
    | undefined
  > {
    // In DependenciesScanner#scanForModules we already check for undefined or invalid modules
    // We still need to catch the edge-case of `forwardRef(() => undefined)`
    if (!metatypeToReplace || !newMetatype) {
      throw new UndefinedForwardRefException(scope);
    }

    const { token } = await this.moduleCompiler.compile(metatypeToReplace);
    const { type, dynamicMetadata } =
      await this.moduleCompiler.compile(newMetatype);

    return {
      moduleRef: await this.setModule(
        {
          token,
          type,
          dynamicMetadata,
        },
        scope,
      ),
      inserted: false,
    };
  }

  /**
   * 将编译产物登记为容器中的模块实例（addModule/replaceModule 的底层实现）
   *
   * 处理流程：
   * 1. 创建 Module 实例并设置 token、initOnPreview 标志
   * 2. 将模块写入 modules 容器（以 token 为键）
   * 3. 递归注册动态模块元数据及其 imports
   * 4. 若是全局模块，则标记 isGlobal、将 distance 置为 MAX_VALUE
   *    （保证其生命周期钩子在应用初始化时最先执行），并加入全局模块集合
   *
   * @param moduleFactory - 模块编译产物（token、类型与动态元数据）
   * @param scope - 模块引用链
   * @returns 新创建并已登记的模块实例
   */
  private async setModule(
    { token, dynamicMetadata, type }: ModuleFactory,
    scope: ModuleScope,
  ): Promise<Module> {
    const moduleRef = new Module(type, this);
    moduleRef.token = token;
    moduleRef.initOnPreview = this.shouldInitOnPreview(type);
    this.modules.set(token, moduleRef);

    const updatedScope = ([] as ModuleScope).concat(scope, type);
    await this.addDynamicMetadata(token, dynamicMetadata!, updatedScope);

    if (this.isGlobalModule(type, dynamicMetadata)) {
      moduleRef.isGlobal = true;

      // Set global module distance to MAX_VALUE to ensure their lifecycle hooks
      // are always executed first (when initializing the application)
      moduleRef.distance = Number.MAX_VALUE;
      this.addGlobalModule(moduleRef);
    }

    return moduleRef;
  }

  /**
   * 缓存动态模块元数据，并递归注册其 imports 中的模块
   *
   * @param token - 模块唯一标识
   * @param dynamicModuleMetadata - 动态模块配置（providers/imports/exports/exports 等）
   * @param scope - 模块引用链，透传给递归注册的子模块
   */
  public async addDynamicMetadata(
    token: string,
    dynamicModuleMetadata: Partial<DynamicModule>,
    scope: Type<any>[],
  ) {
    if (!dynamicModuleMetadata) {
      return;
    }
    this.dynamicModulesMetadata.set(token, dynamicModuleMetadata);

    const { imports } = dynamicModuleMetadata;
    await this.addDynamicModules(imports!, scope);
  }

  /**
   * 并行注册一组模块（通常来自动态模块的 imports 数组）
   *
   * @param modules - 模块元类型数组
   * @param scope - 模块引用链
   */
  public async addDynamicModules(modules: any[], scope: Type<any>[]) {
    if (!modules) {
      return;
    }
    await Promise.all(modules.map(module => this.addModule(module, scope)));
  }

  /**
   * 判断模块是否为全局模块
   *
   * 优先检查动态模块元数据中的 global: true，其次检查 @Global() 装饰器
   * 写入的 GLOBAL_MODULE_METADATA 元数据。
   *
   * @param metatype - 模块类
   * @param dynamicMetadata - 动态模块配置（可选）
   * @returns 是全局模块返回 true
   */
  public isGlobalModule(
    metatype: Type<any>,
    dynamicMetadata?: Partial<DynamicModule>,
  ): boolean {
    if (dynamicMetadata && dynamicMetadata.global) {
      return true;
    }
    return !!Reflect.getMetadata(GLOBAL_MODULE_METADATA, metatype);
  }

  /**
   * 将模块加入全局模块集合（后续 bindGlobalScope 时会被注入到所有模块）
   *
   * @param module - 全局模块实例
   */
  public addGlobalModule(module: Module) {
    this.globalModules.add(module);
  }

  /** 获取容器持有的全部模块（以 token 为键的 Map 结构） */
  public getModules(): ModulesContainer {
    return this.modules;
  }

  /** 获取模块编译器实例 */
  public getModuleCompiler(): ModuleCompiler {
    return this.moduleCompiler;
  }

  /**
   * 按模块 token 查找模块
   *
   * @param moduleKey - 模块唯一标识 token
   * @returns 对应的模块实例；不存在时返回 undefined
   */
  public getModuleByKey(moduleKey: string): Module | undefined {
    return this.modules.get(moduleKey);
  }

  /** 获取框架内部核心模块（InternalCoreModule）的引用 */
  public getInternalCoreModuleRef(): Module | undefined {
    return this.internalCoreModule;
  }

  /**
   * 为指定模块添加一条 import 关系（建立模块图的边）
   *
   * @param relatedModule - 被导入的模块元类型
   * @param token - 宿主模块的 token
   */
  public async addImport(
    relatedModule: Type<any> | DynamicModule,
    token: string,
  ) {
    if (!this.modules.has(token)) {
      return;
    }
    const moduleRef = this.modules.get(token)!;
    const { token: relatedModuleToken } =
      await this.moduleCompiler.compile(relatedModule);
    const related = this.modules.get(relatedModuleToken)!;
    moduleRef.addImport(related);
  }

  /**
   * 向指定模块注册一个 provider
   *
   * @param provider - provider 定义（类/值/工厂等）
   * @param token - 宿主模块 token
   * @param enhancerSubtype - 增强器子类型（如 guard/interceptor 等，非增强器时不传）
   * @returns provider 在模块内的注册键（一般为 provider 类或 provide 标识）
   */
  public addProvider(
    provider: Provider,
    token: string,
    enhancerSubtype?: EnhancerSubtype,
  ): string | symbol | Function {
    const moduleRef = this.modules.get(token);
    if (!provider) {
      throw new CircularDependencyException(moduleRef?.metatype.name);
    }
    if (!moduleRef) {
      throw new UnknownModuleException();
    }
    const providerKey = moduleRef.addProvider(provider, enhancerSubtype!);
    const providerRef = moduleRef.getProviderByKey(providerKey);

    DiscoverableMetaHostCollection.inspectProvider(this.modules, providerRef);

    return providerKey as Function;
  }

  /**
   * 向指定模块注册一个可注入对象（injectable）
   *
   * 典型场景是增强器（guard/interceptor/pipe/filter）既注册到模块的 injectables 表，
   * 又通过 host 关联到使用它的宿主类。
   *
   * @param injectable - 可注入对象定义
   * @param token - 宿主模块 token
   * @param enhancerSubtype - 增强器子类型
   * @param host - 可选的宿主类（增强器所依附的 controller/provider 类）
   * @returns 可注入对象在模块内的注册键
   */
  public addInjectable(
    injectable: Provider,
    token: string,
    enhancerSubtype: EnhancerSubtype,
    host?: Type<Injectable>,
  ) {
    if (!this.modules.has(token)) {
      throw new UnknownModuleException();
    }
    const moduleRef = this.modules.get(token)!;
    return moduleRef.addInjectable(injectable, enhancerSubtype, host);
  }

  /**
   * 为指定模块登记一条导出声明（导出 provider 或导出模块）
   *
   * @param toExport - 被导出的 provider 类 / 模块类 / 动态模块
   * @param token - 宿主模块 token
   */
  public addExportedProviderOrModule(
    toExport: Type<any> | DynamicModule,
    token: string,
  ) {
    if (!this.modules.has(token)) {
      throw new UnknownModuleException();
    }
    const moduleRef = this.modules.get(token)!;
    moduleRef.addExportedProviderOrModule(toExport);
  }

  /**
   * 向指定模块注册一个 controller，并进行可发现性元数据探测
   * （供 DiscoveryService 等按元数据查找 controller）
   *
   * @param controller - controller 类
   * @param token - 宿主模块 token
   */
  public addController(controller: Type<any>, token: string) {
    if (!this.modules.has(token)) {
      throw new UnknownModuleException();
    }
    const moduleRef = this.modules.get(token)!;
    moduleRef.addController(controller);

    const controllerRef = moduleRef.controllers.get(controller)!;
    DiscoverableMetaHostCollection.inspectController(
      this.modules,
      controllerRef,
    );
  }

  /**
   * 清空容器中的所有模块（应用关闭或重建容器时使用）
   */
  public clear() {
    this.modules.clear();
  }

  /**
   * 在所有模块范围内替换某个 provider（用于 Hot Reload 等场景）
   *
   * @param toReplace - 待替换的 provider 标识（类或 provide token）
   * @param options - 替换选项（如新的作用域）
   */
  public replace(toReplace: any, options: { scope: any[] | null }) {
    this.modules.forEach(moduleRef => moduleRef.replace(toReplace, options));
  }

  /**
   * 全局模块绑定入口：把所有全局模块绑定到每个模块的 imports 中
   * （在依赖扫描完成后、实例化之前调用）
   */
  public bindGlobalScope() {
    this.modules.forEach(moduleRef => this.bindGlobalsToImports(moduleRef));
  }

  /**
   * 将所有全局模块绑定到指定模块的 imports 中
   *
   * @param moduleRef - 目标模块
   */
  public bindGlobalsToImports(moduleRef: Module) {
    this.globalModules.forEach(globalModule =>
      this.bindGlobalModuleToModule(moduleRef, globalModule),
    );
  }

  /**
   * 将单个全局模块作为 import 加入目标模块
   *
   * 注意：目标模块自身或内部核心模块除外（避免自引用与重复注入）。
   *
   * @param target - 目标模块
   * @param globalModule - 全局模块
   */
  public bindGlobalModuleToModule(target: Module, globalModule: Module) {
    if (target === globalModule || target === this.internalCoreModule) {
      return;
    }
    target.addImport(globalModule);
  }

  //K 必须是 DynamicModule 的属性名，但是不能是'global' | 'module'
  /**
   * 按模块 token 获取动态模块元数据（重载 1：返回完整元数据对象）
   *
   * @param token - 模块唯一标识
   * @returns 动态模块元数据（可能为 undefined）
   */
  public getDynamicMetadataByToken(token: string): Partial<DynamicModule>;
  /**
   * 按模块 token 获取动态模块元数据的指定字段（重载 2）
   *
   * @param token - 模块唯一标识
   * @param metadataKey - 元数据字段名（不能是 global/module）
   * @returns 对应字段值；缺失时返回空数组
   */
  public getDynamicMetadataByToken<
    K extends Exclude<keyof DynamicModule, 'global' | 'module'>,
  >(token: string, metadataKey: K): DynamicModule[K];
  /**
   * getDynamicMetadataByToken 的实际实现（根据是否传 metadataKey 决定返回形式）
   */
  public getDynamicMetadataByToken(
    token: string,
    metadataKey?: Exclude<keyof DynamicModule, 'global' | 'module'>,
  ) {
    const metadata = this.dynamicModulesMetadata.get(token);
    return metadataKey ? (metadata?.[metadataKey] ?? []) : metadata;
  }

  /**
   * 登记框架内部核心模块（InternalCoreModule）
   *
   * 同时以类名作为键将其写入 modules 容器，便于按名称查找。
   *
   * @param moduleRef - 内部核心模块实例
   */
  public registerCoreModuleRef(moduleRef: Module) {
    this.internalCoreModule = moduleRef;
    this.modules[InternalCoreModule.name] = moduleRef;
  }

  /** 获取模块不透明键工厂（用于生成模块唯一 token 的策略对象） */
  public getModuleTokenFactory(): ModuleOpaqueKeyFactory {
    return this.moduleCompiler.moduleOpaqueKeyFactory;
  }

  /**
   * 注册请求上下文中的 REQUEST provider 实例
   *
   * 在请求作用域应用中，每个请求会生成一个 ContextId，
   * 该方法把当前请求对象预先写入内部核心模块的 REQUEST wrapper，
   * 使后续依赖注入可以直接解析到本次请求的 request 对象。
   *
   * @param request - 当前请求对象
   * @param contextId - 请求上下文 ID
   */
  public registerRequestProvider<T = any>(request: T, contextId: ContextId) {
    const wrapper = this.internalCoreModule.getProviderByKey(REQUEST);
    wrapper.setInstanceByContextId(contextId, {
      instance: request,
      isResolved: true,
    });
  }

  /**
   * 判断模块类型是否在"预初始化白名单"中（preview 模式下需提前实例化的模块）
   *
   * @param type - 模块类
   * @returns 在白名单中返回 true
   */
  private shouldInitOnPreview(type: Type) {
    return InitializeOnPreviewAllowlist.has(type);
  }
}
