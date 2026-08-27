import { DynamicModule, ForwardReference, Provider } from '@nestjs/common';
import {
  CATCH_WATERMARK,
  CONTROLLER_WATERMARK,
  ENHANCER_KEY_TO_SUBTYPE_MAP,
  EXCEPTION_FILTERS_METADATA,
  EnhancerSubtype,
  GUARDS_METADATA,
  INJECTABLE_WATERMARK,
  INTERCEPTORS_METADATA,
  MODULE_METADATA,
  PIPES_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import {
  CanActivate,
  ClassProvider,
  Controller,
  ExceptionFilter,
  ExistingProvider,
  FactoryProvider,
  Injectable,
  InjectionToken,
  NestInterceptor,
  PipeTransform,
  Scope,
  Type,
  ValueProvider,
} from '@nestjs/common/interfaces';
import {
  isFunction,
  isNil,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { ApplicationConfig } from './application-config';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  APP_PIPE,
  ENHANCER_TOKEN_TO_SUBTYPE_MAP,
} from './constants';
import { CircularDependencyException } from './errors/exceptions/circular-dependency.exception';
import { InvalidClassModuleException } from './errors/exceptions/invalid-class-module.exception';
import { InvalidModuleException } from './errors/exceptions/invalid-module.exception';
import { UndefinedModuleException } from './errors/exceptions/undefined-module.exception';
import { getClassScope } from './helpers/get-class-scope';
import { NestContainer } from './injector/container';
import { InstanceWrapper } from './injector/instance-wrapper';
import { InternalCoreModuleFactory } from './injector/internal-core-module/internal-core-module-factory';
import { Module } from './injector/module';
import { TopologyTree } from './injector/topology-tree/topology-tree';
import { GraphInspector } from './inspector/graph-inspector';
import { UuidFactory } from './inspector/uuid-factory';
import { ModuleDefinition } from './interfaces/module-definition.interface';
import { ModuleOverride } from './interfaces/module-override.interface';
import { MetadataScanner } from './metadata-scanner';

interface ApplicationProviderWrapper {
  moduleKey: string;
  providerKey: string;
  type: InjectionToken;
  scope?: Scope;
}

interface ModulesScanParameters {
  moduleDefinition: ModuleDefinition;
  scope?: Type<unknown>[];
  ctxRegistry?: (ForwardReference | DynamicModule | Type<unknown>)[];
  overrides?: ModuleOverride[];
  lazy?: boolean;
}

export class DependenciesScanner {
  private readonly applicationProvidersApplyMap: ApplicationProviderWrapper[] =
    [];

  constructor(
    private readonly container: NestContainer,
    private readonly metadataScanner: MetadataScanner,
    private readonly graphInspector: GraphInspector,
    private readonly applicationConfig = new ApplicationConfig(),
  ) {}

  /**
   * 应用启动入口：扫描并构建整个依赖注入容器
   *
   * 执行顺序：
   * 1. 注册框架内部核心模块（Reflector、HttpAdapterHost 等）
   * 2. 递归扫描用户模块树，将所有模块注册进容器
   * 3. 反射每个模块的 imports/providers/controllers/exports，建立依赖关系
   * 4. 将请求/瞬态作用域的全局增强器附加到所有控制器
   * 5. 计算模块距离（必须在全局模块链接前完成）
   * 6. 链接全局模块到所有模块的作用域
   *
   * @param module - 应用根模块
   * @param options - 可选的模块覆盖配置
   */
  public async scan(
    module: Type<any>,
    options?: { overrides?: ModuleOverride[] },
  ) {
    // 1. 注册全局的 InternalCoreModule（框架内置服务）
    await this.registerCoreModule(options?.overrides);
    // 2. 递归扫描模块树，将每个模块注册到容器
    await this.scanForModules({
      moduleDefinition: module,
      overrides: options?.overrides,
    });
    // 3. 反射每个模块的依赖项，建立 providers/controllers/imports/exports 关系
    await this.scanModulesForDependencies();
    // 4. 将请求/瞬态作用域的全局增强器元数据附加到所有控制器
    this.addScopedEnhancersMetadata();

    // 5. 模块距离计算应在所有模块扫描完成后但在全局模块注册（链接到所有模块）之前进行。
    //    全局模块的距离无论如何都会设置为 MAX。
    this.calculateModulesDistance();

    // 6. 将全局模块链接到所有模块的作用域
    this.container.bindGlobalScope();
  }

  /**
   * 递归扫描模块树
   *
   * 深度优先遍历模块的 imports 属性，将每个模块注册到容器中。
   *
   * @param moduleDefinition - 模块定义（类、DynamicModule 或 ForwardReference）
   * @param lazy - 是否为懒加载模块
   * @param scope - 当前模块的父级作用域链（用于循环依赖检测的错误提示）
   * @param ctxRegistry - 已注册的模块上下文（用于循环依赖检测）
   * @param overrides - 模块覆盖配置
   */
  public async scanForModules({
    moduleDefinition,
    lazy,
    scope = [],
    ctxRegistry = [],
    overrides = [],
  }: ModulesScanParameters): Promise<Module[]> {
    // 1. 将模块插入容器（如果已存在则返回已有实例）
    const { moduleRef: moduleInstance, inserted: moduleInserted } =
      (await this.insertOrOverrideModule(moduleDefinition, overrides, scope)) ??
      {};

    // 2. 检查模块覆盖配置（允许用户用自定义模块替换原模块）
    moduleDefinition =
      this.getOverrideModuleByModule(moduleDefinition, overrides)?.newModule ??
      moduleDefinition;

    // 3. 处理异步模块（Promise 类型的 DynamicModule）
    moduleDefinition =
      moduleDefinition instanceof Promise
        ? await moduleDefinition
        : moduleDefinition;

    // 4. 将当前模块加入上下文注册表（用于防止循环依赖）
    ctxRegistry.push(moduleDefinition);

    // 5. 解析 forwardRef（循环依赖引用）
    if (this.isForwardReference(moduleDefinition)) {
      moduleDefinition = (moduleDefinition as ForwardReference).forwardRef();
    }

    // 6. 获取模块的 imports 列表
    //    静态模块 → 从 Reflect Metadata 读取
    //    动态模块 → 合并装饰器和 DynamicModule 中的 imports
    const modules = !this.isDynamicModule(
      moduleDefinition as Type<any> | DynamicModule,
    )
      ? this.reflectMetadata(
          MODULE_METADATA.IMPORTS,
          moduleDefinition as Type<any>,
        )
      : [
          ...this.reflectMetadata(
            MODULE_METADATA.IMPORTS,
            (moduleDefinition as DynamicModule).module,
          ),
          ...((moduleDefinition as DynamicModule).imports || []),
        ];

    // 7. 递归扫描子模块（深度优先）
    let registeredModuleRefs: Module[] = [];
    for (const [index, innerModule] of modules.entries()) {
      // 在循环依赖的情况下（ES 模块系统），JavaScript 会将类型解析为 `undefined`。
      if (innerModule === undefined) {
        throw new UndefinedModuleException(moduleDefinition, index, scope);
      }
      if (!innerModule) {
        throw new InvalidModuleException(moduleDefinition, index, scope);
      }
      // 已注册过的模块跳过（防止循环依赖导致死循环）
      if (ctxRegistry.includes(innerModule)) {
        continue;
      }
      // 递归扫描子模块，传递当前 context 和更新后的 scope 链
      const moduleRefs = await this.scanForModules({
        moduleDefinition: innerModule,
        scope: ([] as Array<Type>).concat(scope, moduleDefinition as Type),
        ctxRegistry,
        overrides,
        lazy,
      });
      registeredModuleRefs = registeredModuleRefs.concat(moduleRefs);
    }

    // 8. 如果模块已存在（非首次插入），只返回子模块引用
    if (!moduleInstance) {
      return registeredModuleRefs;
    }

    // 9. 懒加载模块：绑定全局模块到 imports
    if (lazy && moduleInserted) {
      this.container.bindGlobalsToImports(moduleInstance);
    }

    // 10. 返回当前模块及其所有子模块的引用
    return [moduleInstance].concat(registeredModuleRefs);
  }

  public async insertModule(
    moduleDefinition: any,
    scope: Type<unknown>[],
  ): Promise<
    | {
        moduleRef: Module;
        inserted: boolean;
      }
    | undefined
  > {
    const moduleToAdd = this.isForwardReference(moduleDefinition)
      ? moduleDefinition.forwardRef()
      : moduleDefinition;

    if (
      this.isInjectable(moduleToAdd) ||
      this.isController(moduleToAdd) ||
      this.isExceptionFilter(moduleToAdd)
    ) {
      throw new InvalidClassModuleException(moduleDefinition, scope);
    }

    return this.container.addModule(moduleToAdd, scope);
  }

  /**
   * 扫描所有已注册模块的依赖项
   *
   * 在 `scanForModules` 完成模块树注册之后调用，遍历容器中的每一个模块，
   * 依次反射读取其装饰器上标注的 imports / providers / controllers / exports，
   * 并将它们插入到对应的模块实例中，从而构建出完整的依赖注入图谱。
   *
   * @param modules - 待扫描的模块集合，默认为容器中当前所有模块
   */
  public async scanModulesForDependencies(
    modules: Map<string, Module> = this.container.getModules(),
  ) {
    // 解构 Map entries：token 为模块的唯一标识，metatype 为模块类的原始构造函数
    // 等同于 let [key, value] of map；其中 value 解构出 metatype
    for (const [token, { metatype }] of modules) {
      // 1. 反射并注册当前模块的子模块导入（imports）
      //    将 imports 中的模块通过 container.addImport 关联到当前模块
      await this.reflectImports(metatype, token, metatype.name);
      // 2. 反射并注册当前模块的 providers（含自定义 provider 与增强器）
      //    同时反射 provider 类上的 guards/interceptors/filters/pipes 等动态元数据
      this.reflectProviders(metatype, token);
      // 3. 反射并注册当前模块的 controllers，并为每个控制器反射其方法级增强器元数据
      this.reflectControllers(metatype, token);
      // 4. 反射并注册当前模块的 exports，使对应 provider / 模块可被其他模块注入
      this.reflectExports(metatype, token);
    }
  }

  public async reflectImports(
    module: Type<unknown>,
    token: string,
    context: string,
  ) {
    const modules = [
      ...this.reflectMetadata(MODULE_METADATA.IMPORTS, module),
      ...this.container.getDynamicMetadataByToken(
        token,
        MODULE_METADATA.IMPORTS as 'imports',
      )!,
    ];
    for (const related of modules) {
      await this.insertImport(related, token, context);
    }
  }

  public reflectProviders(module: Type<any>, token: string) {
    const providers = [
      ...this.reflectMetadata(MODULE_METADATA.PROVIDERS, module),
      ...this.container.getDynamicMetadataByToken(
        token,
        MODULE_METADATA.PROVIDERS as 'providers',
      )!,
    ];
    providers.forEach(provider => {
      this.insertProvider(provider, token);
      this.reflectDynamicMetadata(provider, token);
    });
  }

  public reflectControllers(module: Type<any>, token: string) {
    const controllers = [
      ...this.reflectMetadata(MODULE_METADATA.CONTROLLERS, module),
      ...this.container.getDynamicMetadataByToken(
        token,
        MODULE_METADATA.CONTROLLERS as 'controllers',
      )!,
    ];
    controllers.forEach(item => {
      this.insertController(item, token);
      this.reflectDynamicMetadata(item, token);
    });
  }

  public reflectDynamicMetadata(cls: Type<Injectable>, token: string) {
    if (!cls || !cls.prototype) {
      return;
    }
    this.reflectInjectables(cls, token, GUARDS_METADATA);
    this.reflectInjectables(cls, token, INTERCEPTORS_METADATA);
    this.reflectInjectables(cls, token, EXCEPTION_FILTERS_METADATA);
    this.reflectInjectables(cls, token, PIPES_METADATA);
    this.reflectParamInjectables(cls, token, ROUTE_ARGS_METADATA);
  }

  public reflectExports(module: Type<unknown>, token: string) {
    const exports = [
      ...this.reflectMetadata(MODULE_METADATA.EXPORTS, module),
      ...this.container.getDynamicMetadataByToken(
        token,
        MODULE_METADATA.EXPORTS as 'exports',
      )!,
    ];
    exports.forEach(exportedProvider =>
      this.insertExportedProviderOrModule(exportedProvider, token),
    );
  }

  public reflectInjectables(
    component: Type<Injectable>,
    token: string,
    metadataKey: string,
  ) {
    const controllerInjectables = this.reflectMetadata<Type<Injectable>>(
      metadataKey,
      component,
    );
    const methodInjectables = this.metadataScanner
      .getAllMethodNames(component.prototype)
      .reduce(
        (acc, method) => {
          const methodInjectable = this.reflectKeyMetadata(
            component,
            metadataKey,
            method,
          );

          if (methodInjectable) {
            acc.push(methodInjectable);
          }

          return acc;
        },
        [] as Array<{
          methodKey: string;
          metadata: Type<Injectable>[];
        }>,
      );

    controllerInjectables.forEach(injectable =>
      this.insertInjectable(
        injectable,
        token,
        component,
        ENHANCER_KEY_TO_SUBTYPE_MAP[metadataKey],
      ),
    );
    methodInjectables.forEach(methodInjectable => {
      methodInjectable.metadata.forEach(injectable =>
        this.insertInjectable(
          injectable,
          token,
          component,
          ENHANCER_KEY_TO_SUBTYPE_MAP[metadataKey],
          methodInjectable.methodKey,
        ),
      );
    });
  }

  public reflectParamInjectables(
    component: Type<Injectable>,
    token: string,
    metadataKey: string,
  ) {
    const paramsMethods = this.metadataScanner.getAllMethodNames(
      component.prototype,
    );

    paramsMethods.forEach(methodKey => {
      const metadata: Record<
        string,
        {
          index: number;
          data: unknown;
          pipes: Array<Type<PipeTransform> | PipeTransform>;
        }
      > = Reflect.getMetadata(metadataKey, component, methodKey);

      if (!metadata) {
        return;
      }

      const params = Object.values(metadata);
      params
        .map(item => item.pipes)
        .flat(1)
        .forEach(injectable =>
          this.insertInjectable(
            injectable,
            token,
            component,
            'pipe',
            methodKey,
          ),
        );
    });
  }

  public reflectKeyMetadata(
    component: Type<Injectable>,
    key: string,
    methodKey: string,
  ): { methodKey: string; metadata: any } | undefined {
    let prototype = component.prototype;
    do {
      const descriptor = Reflect.getOwnPropertyDescriptor(prototype, methodKey);
      if (!descriptor) {
        continue;
      }
      const metadata = Reflect.getMetadata(key, descriptor.value);
      if (!metadata) {
        return;
      }
      return { methodKey, metadata };
    } while (
      (prototype = Reflect.getPrototypeOf(prototype)) &&
      prototype !== Object.prototype &&
      prototype
    );
    return undefined;
  }

  public calculateModulesDistance() {
    const modulesGenerator = this.container.getModules().values();
    // 跳过 "InternalCoreModule"
    // 第二个元素是实际的根模块
    modulesGenerator.next();

    const rootModule = modulesGenerator.next().value!;
    if (!rootModule) {
      return;
    }

    // 将模块转换为无环连通图
    const tree = new TopologyTree(rootModule);
    tree.walk((moduleRef, depth) => {
      if (moduleRef.isGlobal) {
        return;
      }
      moduleRef.distance = depth;
    });
  }

  public async insertImport(related: any, token: string, context: string) {
    if (isUndefined(related)) {
      throw new CircularDependencyException(context);
    }
    if (this.isForwardReference(related)) {
      return this.container.addImport(related.forwardRef(), token);
    }
    await this.container.addImport(related, token);
  }

  public isCustomProvider(
    provider: Provider,
  ): provider is
    | ClassProvider
    | ValueProvider
    | FactoryProvider
    | ExistingProvider {
    return provider && !isNil((provider as any).provide);
  }

  public insertProvider(provider: Provider, token: string) {
    const isCustomProvider = this.isCustomProvider(provider);
    if (!isCustomProvider) {
      return this.container.addProvider(provider, token);
    }
    const applyProvidersMap = this.getApplyProvidersMap();
    const providersKeys = Object.keys(applyProvidersMap);
    const type = provider.provide;

    if (!providersKeys.includes(type as string)) {
      return this.container.addProvider(provider as any, token);
    }
    const uuid = UuidFactory.get(type.toString());
    const providerToken = `${type as string} (UUID: ${uuid})`;

    let scope = (provider as ClassProvider | FactoryProvider).scope;
    if (isNil(scope) && (provider as ClassProvider).useClass) {
      scope = getClassScope((provider as ClassProvider).useClass);
    }
    this.applicationProvidersApplyMap.push({
      type,
      moduleKey: token,
      providerKey: providerToken,
      scope,
    });

    const newProvider = {
      ...provider,
      provide: providerToken,
      scope,
    } as Provider;

    const enhancerSubtype =
      ENHANCER_TOKEN_TO_SUBTYPE_MAP[
        type as
          | typeof APP_GUARD
          | typeof APP_PIPE
          | typeof APP_FILTER
          | typeof APP_INTERCEPTOR
      ];
    const factoryOrClassProvider = newProvider as
      | FactoryProvider
      | ClassProvider;
    if (this.isRequestOrTransient(factoryOrClassProvider.scope!)) {
      return this.container.addInjectable(newProvider, token, enhancerSubtype);
    }
    this.container.addProvider(newProvider, token, enhancerSubtype);
  }

  public insertInjectable(
    injectable: Type<Injectable> | object,
    token: string,
    host: Type<Injectable>,
    subtype: EnhancerSubtype,
    methodKey?: string,
  ) {
    if (isFunction(injectable)) {
      const instanceWrapper = this.container.addInjectable(
        injectable as Type,
        token,
        subtype,
        host,
      ) as InstanceWrapper;

      this.graphInspector.insertEnhancerMetadataCache({
        moduleToken: token,
        classRef: host,
        enhancerInstanceWrapper: instanceWrapper,
        targetNodeId: instanceWrapper.id,
        subtype,
        methodKey,
      });
      return instanceWrapper;
    } else {
      this.graphInspector.insertEnhancerMetadataCache({
        moduleToken: token,
        classRef: host,
        enhancerRef: injectable,
        methodKey,
        subtype,
      });
    }
  }

  public insertExportedProviderOrModule(
    toExport: ForwardReference | DynamicModule | Type<unknown>,
    token: string,
  ) {
    const fulfilledProvider = this.isForwardReference(toExport)
      ? toExport.forwardRef()
      : toExport;
    this.container.addExportedProviderOrModule(fulfilledProvider, token);
  }

  public insertController(controller: Type<Controller>, token: string) {
    this.container.addController(controller, token);
  }

  private insertOrOverrideModule(
    moduleDefinition: ModuleDefinition,
    overrides: ModuleOverride[],
    scope: Type<unknown>[],
  ): Promise<
    | {
        moduleRef: Module;
        inserted: boolean;
      }
    | undefined
  > {
    const overrideModule = this.getOverrideModuleByModule(
      moduleDefinition,
      overrides,
    );
    if (overrideModule !== undefined) {
      return this.overrideModule(
        moduleDefinition,
        overrideModule.newModule,
        scope,
      );
    }

    return this.insertModule(moduleDefinition, scope);
  }

  private getOverrideModuleByModule(
    module: ModuleDefinition,
    overrides: ModuleOverride[],
  ): ModuleOverride | undefined {
    if (this.isForwardReference(module)) {
      return overrides.find(moduleToOverride => {
        return (
          moduleToOverride.moduleToReplace === module.forwardRef() ||
          (
            moduleToOverride.moduleToReplace as ForwardReference
          ).forwardRef?.() === module.forwardRef()
        );
      });
    }

    return overrides.find(
      moduleToOverride => moduleToOverride.moduleToReplace === module,
    );
  }

  private async overrideModule(
    moduleToOverride: ModuleDefinition,
    newModule: ModuleDefinition,
    scope: Type<unknown>[],
  ): Promise<
    | {
        moduleRef: Module;
        inserted: boolean;
      }
    | undefined
  > {
    return this.container.replaceModule(
      this.isForwardReference(moduleToOverride)
        ? moduleToOverride.forwardRef()
        : moduleToOverride,
      this.isForwardReference(newModule) ? newModule.forwardRef() : newModule,
      scope,
    );
  }

  /**
   *
   * reflectMetadata 是扫描器用来**从装饰器标注的类上"读出"
   * 模块依赖关系（imports/providers/controllers/exports）和
   * 增强器配置（guards、interceptors 等）**的底层反射工具，
   * 是整个依赖扫描（DI 容器构建）的起点。没有它，Nest 就无法知道一个模块里装了什么、依赖了什么。
   */
  public reflectMetadata<T = any>(
    metadataKey: string,
    metatype: Type<any>,
  ): T[] {
    return Reflect.getMetadata(metadataKey, metatype) || [];
  }

  /**
   * 注册框架内部核心模块
   *
   * 1. 使用 InternalCoreModuleFactory 创建模块定义（含 Reflector、HttpAdapterHost 等核心服务）
   * 2. 通过 scanForModules 将核心模块注册到容器中
   * 3. 保存核心模块引用，供后续使用
   */
  public async registerCoreModule(overrides?: ModuleOverride[]) {
    // 创建 InternalCoreModule 的模块定义（DynamicModule 格式）
    const moduleDefinition = InternalCoreModuleFactory.create(
      this.container,
      this,
      this.container.getModuleCompiler(),
      this.container.getHttpAdapterHostRef(),
      this.graphInspector,
      overrides,
    );
    // 将核心模块扫描并注册到容器
    const [instance] = await this.scanForModules({
      moduleDefinition,
      overrides,
    });
    // 保存核心模块引用到容器
    this.container.registerCoreModuleRef(instance);
  }

  /**
   * 将请求/瞬态作用域的全局增强器（APP_GUARD/APP_PIPE/APP_INTERCEPTOR/APP_FILTER）
   * 附加到所有模块的所有控制器与 entryProvider 上
   *
   * 为什么只处理请求/瞬态作用域？
   * - 默认（单例）作用域的增强器在 `applyApplicationProviders` 阶段
   *   直接以实例形式注册到 applicationConfig 即可，无需写入每个控制器。
   * - 而请求/瞬态作用域的增强器每次请求都会重新创建实例，必须在每个
   *   控制器的元数据中持有其 InstanceWrapper 引用，以便请求处理时按需解析。
   *
   * 为什么要在扫描阶段提前写入？
   * 因为运行期控制器处理请求时已无法再回头补元数据，必须在容器绑定完成前
   * 把这些"全局但每请求新建"的增强器铺到所有控制器上。
   * 详细用例参考 C:\Users\Admin\Desktop\nest\analyze\addScopedEnhancersMetadata-demo.md
   */
  public addScopedEnhancersMetadata() {
    // 只挑选作用域为 REQUEST 或 TRANSIENT 的全局增强器
    iterate(this.applicationProvidersApplyMap)
      .filter(wrapper => this.isRequestOrTransient(wrapper.scope!))
      .forEach(({ moduleKey, providerKey }) => {
        const modulesContainer = this.container.getModules();
        // 根据模块 token 取出该增强器所属模块，并从 injectables 集合中拿到其 InstanceWrapper
        const { injectables } = modulesContainer.get(moduleKey)!;
        const instanceWrapper = injectables.get(providerKey);

        const iterableIterator = modulesContainer.values();
        // 遍历容器内所有模块，收集每个模块的 controllers 与 entryProviders，
        // 合并扁平化后，给每一个控制器/入口 provider 挂载该增强器元数据
        iterate(iterableIterator)
          .map(moduleRef =>
            Array.from<InstanceWrapper>(moduleRef.controllers.values()).concat(
              moduleRef.entryProviders,
            ),
          )
          .flatten()
          .forEach(controllerOrEntryProvider =>
            controllerOrEntryProvider.addEnhancerMetadata(instanceWrapper!),
          );
      });
  }

  public applyApplicationProviders() {
    const applyProvidersMap = this.getApplyProvidersMap();
    const applyRequestProvidersMap = this.getApplyRequestProvidersMap();

    const getInstanceWrapper = (
      moduleKey: string,
      providerKey: string,
      collectionKey: 'providers' | 'injectables',
    ) => {
      const modules = this.container.getModules();
      const collection = modules.get(moduleKey)![collectionKey];
      return collection.get(providerKey);
    };

    // Add global enhancers to the application config
    this.applicationProvidersApplyMap.forEach(
      ({ moduleKey, providerKey, type, scope }) => {
        let instanceWrapper: InstanceWrapper;
        if (this.isRequestOrTransient(scope!)) {
          instanceWrapper = getInstanceWrapper(
            moduleKey,
            providerKey,
            'injectables',
          )!;

          this.graphInspector.insertAttachedEnhancer(instanceWrapper);
          return applyRequestProvidersMap[type as string](instanceWrapper);
        }
        instanceWrapper = getInstanceWrapper(
          moduleKey,
          providerKey,
          'providers',
        )!;
        this.graphInspector.insertAttachedEnhancer(instanceWrapper);
        applyProvidersMap[type as string](instanceWrapper.instance);
      },
    );
  }

  public getApplyProvidersMap(): { [type: string]: Function } {
    return {
      [APP_INTERCEPTOR]: (interceptor: NestInterceptor) =>
        this.applicationConfig.addGlobalInterceptor(interceptor),
      [APP_PIPE]: (pipe: PipeTransform) =>
        this.applicationConfig.addGlobalPipe(pipe),
      [APP_GUARD]: (guard: CanActivate) =>
        this.applicationConfig.addGlobalGuard(guard),
      [APP_FILTER]: (filter: ExceptionFilter) =>
        this.applicationConfig.addGlobalFilter(filter),
    };
  }

  public getApplyRequestProvidersMap(): { [type: string]: Function } {
    return {
      [APP_INTERCEPTOR]: (interceptor: InstanceWrapper<NestInterceptor>) =>
        this.applicationConfig.addGlobalRequestInterceptor(interceptor),
      [APP_PIPE]: (pipe: InstanceWrapper<PipeTransform>) =>
        this.applicationConfig.addGlobalRequestPipe(pipe),
      [APP_GUARD]: (guard: InstanceWrapper<CanActivate>) =>
        this.applicationConfig.addGlobalRequestGuard(guard),
      [APP_FILTER]: (filter: InstanceWrapper<ExceptionFilter>) =>
        this.applicationConfig.addGlobalRequestFilter(filter),
    };
  }

  public isDynamicModule(
    module: Type<any> | DynamicModule,
  ): module is DynamicModule {
    return module && !!(module as DynamicModule).module;
  }

  /**
   * @param metatype
   * @returns 如果 `metatype` 使用了 `@Injectable()` 装饰器标注，则返回 `true`。
   */
  private isInjectable(metatype: Type<any>): boolean {
    return !!Reflect.getMetadata(INJECTABLE_WATERMARK, metatype);
  }

  /**
   * @param metatype
   * @returns 如果 `metatype` 使用了 `@Controller()` 装饰器标注，则返回 `true`。
   */
  private isController(metatype: Type<any>): boolean {
    return !!Reflect.getMetadata(CONTROLLER_WATERMARK, metatype);
  }

  /**
   * @param metatype
   * @returns 如果 `metatype` 使用了 `@Catch()` 装饰器标注，则返回 `true`。
   */
  private isExceptionFilter(metatype: Type<any>): boolean {
    return !!Reflect.getMetadata(CATCH_WATERMARK, metatype);
  }

  /**
   * 检查其 forwardRef 属性是否为真值
   * 为什么需要这个？
   * 在 NestJS 中，模块之间可能存在循环依赖。例如模块 A 依赖模块 B，模块 B 又依赖模块 A。这时需要 forwardRef() 来延迟模块的引用解析：
   *
   * @Module({
   * imports: [forwardRef(() => ModuleB)],
   * })
   * export class ModuleA {}
   *
   */
  private isForwardReference(
    module: ModuleDefinition,
  ): module is ForwardReference {
    return module && !!(module as ForwardReference).forwardRef;
  }

  private isRequestOrTransient(scope: Scope): boolean {
    return scope === Scope.REQUEST || scope === Scope.TRANSIENT;
  }
}
