import { DynamicModule, Type } from '@nestjs/common';
import { ModuleOverride } from '../../interfaces/module-override.interface';
import { DependenciesScanner } from '../../scanner';
import { ModuleCompiler } from '../compiler';
import { SilentLogger } from '../helpers/silent-logger';
import { InstanceLoader } from '../instance-loader';
import { Module } from '../module';
import { ModuleRef } from '../module-ref';
import { ModulesContainer } from '../modules-container';
import { LazyModuleLoaderLoadOptions } from './lazy-module-loader-options.interface';

/**
 * 懒模块加载器：支持在应用启动完成后按需动态加载模块
 * （通过 LazyModuleLoader provider 注入使用）。
 *
 * 加载流程：
 * 1. 执行用户的 loaderFn 拿到模块定义（静态类或动态模块）
 * 2. 用依赖扫描器扫描该模块（lazy: true 模式）——若模块此前已加载过，
 *    则直接从现有容器中取回其引用并返回
 * 3. 为新扫描出的模块构建独立的懒模块容器，扫描其依赖关系
 * 4. 用实例加载器为这些模块创建全部实例
 * 5. 返回目标模块的 ModuleRef（可继续用 get/resolve 获取模块内 provider）
 */
export class LazyModuleLoader {
  /**
   * 创建懒模块加载器
   *
   * @param dependenciesScanner - 依赖扫描器
   * @param instanceLoader - 实例加载器（用于创建懒加载模块的实例）
   * @param moduleCompiler - 模块编译器
   * @param modulesContainer - 模块容器（用于查找已加载的模块）
   * @param moduleOverrides - 模块覆盖配置（可选）
   */
  constructor(
    private readonly dependenciesScanner: DependenciesScanner,
    private readonly instanceLoader: InstanceLoader,
    private readonly moduleCompiler: ModuleCompiler,
    private readonly modulesContainer: ModulesContainer,
    private readonly moduleOverrides?: ModuleOverride[],
  ) {}

  /**
   * 懒加载一个模块并返回其 ModuleRef
   *
   * @param loaderFn - 返回模块定义的加载函数（支持异步，便于配合 import() 代码分割）
   * @param loadOpts - 加载选项（如关闭日志）
   * @returns 目标模块的 ModuleRef
   */
  public async load(
    loaderFn: () =>
      | Promise<Type<unknown> | DynamicModule>
      | Type<unknown>
      | DynamicModule,
    loadOpts?: LazyModuleLoaderLoadOptions,
  ): Promise<ModuleRef> {
    this.registerLoggerConfiguration(loadOpts);

    const moduleClassOrDynamicDefinition = await loaderFn();
    const moduleInstances = await this.dependenciesScanner.scanForModules({
      moduleDefinition: moduleClassOrDynamicDefinition,
      overrides: this.moduleOverrides,
      lazy: true,
    });
    if (moduleInstances.length === 0) {
      // The module has been loaded already. In this case, we must
      // retrieve a module reference from the existing container.
      const { token } = await this.moduleCompiler.compile(
        moduleClassOrDynamicDefinition,
      );
      const moduleInstance = this.modulesContainer.get(token)!;
      return moduleInstance && this.getTargetModuleRef(moduleInstance);
    }
    const lazyModulesContainer =
      this.createLazyModulesContainer(moduleInstances);
    await this.dependenciesScanner.scanModulesForDependencies(
      lazyModulesContainer,
    );
    await this.instanceLoader.createInstancesOfDependencies(
      lazyModulesContainer,
    );
    const [targetModule] = moduleInstances;
    return this.getTargetModuleRef(targetModule);
  }

  /** 按加载选项配置日志：logger 为 false 时替换为静默日志器 */
  private registerLoggerConfiguration(loadOpts?: LazyModuleLoaderLoadOptions) {
    if (loadOpts?.logger === false) {
      this.instanceLoader.setLogger(new SilentLogger());
    }
  }

  /** 去重后以模块 token 为键构建懒加载模块的独立容器 */
  private createLazyModulesContainer(
    moduleInstances: Module[],
  ): Map<string, Module> {
    moduleInstances = Array.from(new Set(moduleInstances));
    return new Map(moduleInstances.map(ref => [ref.token, ref]));
  }

  /** 从模块实例中取出其绑定的 ModuleRef provider 实例 */
  private getTargetModuleRef(moduleInstance: Module): ModuleRef {
    const moduleRefInstanceWrapper = moduleInstance.getProviderByKey(ModuleRef);
    return moduleRefInstanceWrapper.instance;
  }
}
