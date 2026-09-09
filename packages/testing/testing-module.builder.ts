import { Logger, LoggerService, Module, ModuleMetadata } from '@nestjs/common';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { NestContainer } from '@nestjs/core/injector/container';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { NoopGraphInspector } from '@nestjs/core/inspector/noop-graph-inspector';
import {
  UuidFactory,
  UuidFactoryMode,
} from '@nestjs/core/inspector/uuid-factory';
import { ModuleDefinition } from '@nestjs/core/interfaces/module-definition.interface';
import { ModuleOverride } from '@nestjs/core/interfaces/module-override.interface';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { DependenciesScanner } from '@nestjs/core/scanner';
import {
  MockFactory,
  OverrideBy,
  OverrideByFactoryOptions,
} from './interfaces';
import { OverrideModule } from './interfaces/override-module.interface';
import { TestingLogger } from './services/testing-logger.service';
import { TestingInjector } from './testing-injector';
import { TestingInstanceLoader } from './testing-instance-loader';
import { TestingModule } from './testing-module';

/**
 * @publicApi
 *
 * 测试模块选项类型：从应用上下文选项中挑选的配置项子集，
 * 目前仅暴露 moduleIdGeneratorAlgorithm（模块 id 生成算法）。
 */
export type TestingModuleOptions = Pick<
  NestApplicationContextOptions,
  'moduleIdGeneratorAlgorithm'
>;

/**
 * @publicApi
 *
 * 测试模块构建器：`Test.createTestingModule()` 的返回值，
 * 是整个测试流程的"装配车间"。
 *
 * 典型使用流程：
 * 1. `Test.createTestingModule(metadata)` 创建 builder，内部动态生成
 *    一个 RootTestModule 类并应用 @Module 元数据；
 * 2. 通过 overrideProvider/overrideGuard/overrideInterceptor/
 *    overridePipe/overrideFilter/overrideModule 等方法声明覆盖项，
 *    每个覆盖项返回 OverrideBy 对象，可继续选择 useValue/useFactory/useClass
 *    （模块覆盖则用 useModule）；
 * 3. 可选调用 useMocker() 设置自动 mock 工厂（如 ts-mockito 自动 mock）；
 * 4. 调用 compile() 编译：扫描依赖 -> 应用覆盖 -> 实例化所有依赖，
 *    返回可用的 TestingModule。
 *
 * 覆盖机制原理：覆盖项先记录在 overloadsMap（实例覆盖）和
 * moduleOverloadsMap（模块覆盖）中，compile() 时统一替换容器中
 * 对应的 provider/module 定义，再进行实例化。
 */
export class TestingModuleBuilder {
  private readonly applicationConfig = new ApplicationConfig();
  private readonly container: NestContainer;
  /** 实例级覆盖注册表：token -> 覆盖定义（useValue/useFactory/useClass） */
  private readonly overloadsMap = new Map();
  /** 模块级覆盖注册表：被替换的模块定义 -> 新模块定义 */
  private readonly moduleOverloadsMap = new Map<
    ModuleDefinition,
    ModuleDefinition
  >();
  private readonly module: any;
  private testingLogger: LoggerService;
  private mocker?: MockFactory;

  /**
   * @param metadataScanner - 元数据扫描器，供依赖扫描阶段使用。
   * @param metadata - 测试模块的元数据（imports/controllers/providers/exports）。
   * @param options - 可选的测试模块选项。
   */
  constructor(
    private readonly metadataScanner: MetadataScanner,
    metadata: ModuleMetadata,
    options?: TestingModuleOptions,
  ) {
    this.container = new NestContainer(this.applicationConfig, options);
    this.module = this.createModule(metadata);
  }

  /**
   * 设置测试期间使用的全局日志器（常配合 TestingLogger 静默普通日志）。
   *
   * @param testingLogger - 自定义日志服务实现。
   * @returns builder 自身，支持链式调用。
   */
  public setLogger(testingLogger: LoggerService) {
    this.testingLogger = testingLogger;
    return this;
  }

  /**
   * 覆盖指定的管道（Pipe）：返回 OverrideBy 以选择替换实现。
   *
   * @param typeOrToken - 要覆盖的管道类或注入 token。
   * @returns OverrideBy 对象，供选择 useValue/useFactory/useClass。
   */
  public overridePipe<T = any>(typeOrToken: T): OverrideBy {
    return this.override(typeOrToken, false);
  }

  /**
   * 设置自动 mock 工厂：编译时若某依赖无法解析，会调用该工厂
   * 生成 mock 实例注入（mock 工厂收到的参数是依赖的 token/类引用）。
   *
   * @param mocker - mock 工厂函数。
   * @returns builder 自身，支持链式调用。
   */
  public useMocker(mocker: MockFactory): TestingModuleBuilder {
    this.mocker = mocker;
    return this;
  }

  /**
   * 覆盖指定的过滤器（ExceptionFilter）：返回 OverrideBy 以选择替换实现。
   *
   * @param typeOrToken - 要覆盖的过滤器类或注入 token。
   * @returns OverrideBy 对象，供选择 useValue/useFactory/useClass。
   */
  public overrideFilter<T = any>(typeOrToken: T): OverrideBy {
    return this.override(typeOrToken, false);
  }

  /**
   * 覆盖指定的守卫（Guard）：返回 OverrideBy 以选择替换实现，
   * 例如测试时可把真实鉴权守卫换成总是通过的 mock 守卫。
   *
   * @param typeOrToken - 要覆盖的守卫类或注入 token。
   * @returns OverrideBy 对象，供选择 useValue/useFactory/useClass。
   */
  public overrideGuard<T = any>(typeOrToken: T): OverrideBy {
    return this.override(typeOrToken, false);
  }

  /**
   * 覆盖指定的拦截器（Interceptor）：返回 OverrideBy 以选择替换实现。
   *
   * @param typeOrToken - 要覆盖的拦截器类或注入 token。
   * @returns OverrideBy 对象，供选择 useValue/useFactory/useClass。
   */
  public overrideInterceptor<T = any>(typeOrToken: T): OverrideBy {
    return this.override(typeOrToken, false);
  }

  /**
   * 覆盖指定的提供者（Provider）：这是测试中最常用的覆盖入口，
   * 可把真实服务替换为 mock/stub/fake 实现。
   *
   * @param typeOrToken - 要覆盖的提供者类或注入 token。
   * @returns OverrideBy 对象，供选择 useValue/useFactory/useClass。
   */
  public overrideProvider<T = any>(typeOrToken: T): OverrideBy {
    return this.override(typeOrToken, true);
  }

  /**
   * 覆盖整个模块定义：用 useModule 指定的新模块替换被测模块树中
   * 的某个导入模块（如把真实数据库模块替换为测试用内存模块）。
   *
   * @param moduleToOverride - 要被替换的模块定义（类或动态模块）。
   * @returns OverrideModule 对象，调用其 useModule 指定替代模块。
   */
  public overrideModule(moduleToOverride: ModuleDefinition): OverrideModule {
    return {
      useModule: newModule => {
        this.moduleOverloadsMap.set(moduleToOverride, newModule);
        return this;
      },
    };
  }

  /**
   * 编译测试模块：这是 builder 的终点，产出可直接使用的 TestingModule。
   *
   * 流程：
   * 1. 应用日志器（未设置则使用静默的 TestingLogger）；
   * 2. 根据是否需要快照选择 GraphInspector 实现与 uuid 生成模式；
   * 3. 用 DependenciesScanner 扫描模块元数据构建依赖图（应用模块级覆盖）；
   * 4. 将实例级覆盖应用到容器（container.replace）；
   * 5. 用 TestingInjector + TestingInstanceLoader 实例化所有依赖；
   * 6. 注册应用级提供者，并包装为 TestingModule 返回。
   *
   * @param options - 可选配置：snapshot（记录依赖图快照）、
   *                  preview（惰性预览模式，实例延迟创建）。
   * @returns 编译完成的 TestingModule（依赖已实例化，可直接 get/init）。
   */
  public async compile(
    options: Pick<NestApplicationContextOptions, 'snapshot' | 'preview'> = {},
  ): Promise<TestingModule> {
    this.applyLogger();

    // 1. 根据是否需要依赖图快照，选择真正的 GraphInspector 或空实现，并设定 uuid 模式
    let graphInspector: GraphInspector;
    if (options?.snapshot) {
      graphInspector = new GraphInspector(this.container);
      UuidFactory.mode = UuidFactoryMode.Deterministic;
    } else {
      graphInspector = NoopGraphInspector;
      UuidFactory.mode = UuidFactoryMode.Random;
    }

    // 2. 扫描模块元数据，构建整个依赖图（含模块级覆盖替换）
    const scanner = new DependenciesScanner(
      this.container,
      this.metadataScanner,
      graphInspector,
      this.applicationConfig,
    );
    await scanner.scan(this.module, {
      overrides: this.getModuleOverloads(),
    });

    // 3. 将实例级覆盖（overrideProvider 等）写入容器，替换原 provider 定义
    this.applyOverloadsMap();
    // 4. 实例化所有模块的依赖（走 TestingInjector，支持 mocker 兜底）
    await this.createInstancesOfDependencies(graphInspector, options);
    // 5. 注册应用级别的全局提供者（如 HTTP 服务相关）
    scanner.applyApplicationProviders();

    // 6. 取出根模块并包装成 TestingModule
    const root = this.getRootModule();
    return new TestingModule(
      this.container,
      graphInspector,
      root,
      this.applicationConfig,
    );
  }

  /**
   * 内部通用的覆盖注册方法：把 token 与覆盖选项写入 overloadsMap。
   *
   * @param typeOrToken - 要覆盖的类或 token。
   * @param isProvider - 是否为提供者覆盖（提供者替换实例定义，其余替换增强器定义）。
   * @returns OverrideBy 对象。
   */
  private override<T = any>(typeOrToken: T, isProvider: boolean): OverrideBy {
    const addOverload = (options: any) => {
      this.overloadsMap.set(typeOrToken, {
        ...options,
        isProvider,
      });
      return this;
    };
    return this.createOverrideByBuilder(addOverload);
  }

  /**
   * 构造 OverrideBy 对象：提供 useValue/useFactory/useClass 三种
   * 替换方式，选择后通过闭包 add 把覆盖定义写入注册表。
   *
   * @param add - 由 override() 传入的注册回调。
   * @returns OverrideBy 对象。
   */
  private createOverrideByBuilder(
    add: (provider: any) => TestingModuleBuilder,
  ): OverrideBy {
    return {
      useValue: value => add({ useValue: value }),
      useFactory: (options: OverrideByFactoryOptions) =>
        add({ ...options, useFactory: options.factory }),
      useClass: metatype => add({ useClass: metatype }),
    };
  }

  /** 把所有实例级覆盖应用到容器（container.replace），替换原 provider 定义 */
  private applyOverloadsMap() {
    const overloads = [...this.overloadsMap.entries()];
    overloads.forEach(([item, options]) => {
      this.container.replace(item, options);
    });
  }

  /** 把模块级覆盖注册表转换为扫描器所需的 ModuleOverride 数组 */
  private getModuleOverloads(): ModuleOverride[] {
    const overloads = [...this.moduleOverloadsMap.entries()];
    return overloads.map(([moduleToReplace, newModule]) => ({
      moduleToReplace,
      newModule,
    }));
  }

  /** 取出容器中第一个模块（即 createModule 生成的根测试模块） */
  private getRootModule() {
    const modules = this.container.getModules().values();
    return modules.next().value!;
  }

  /** 使用 TestingInjector 与 TestingInstanceLoader 实例化所有模块的依赖 */
  private async createInstancesOfDependencies(
    graphInspector: GraphInspector,
    options: { preview?: boolean },
  ) {
    const injector = new TestingInjector({
      preview: options?.preview ?? false,
    });
    const instanceLoader = new TestingInstanceLoader(
      this.container,
      injector,
      graphInspector,
    );
    await instanceLoader.createInstancesOfDependencies(
      this.container.getModules(),
      this.mocker,
    );
  }

  /**
   * 动态创建根测试模块：定义一个空类 RootTestModule，
   * 并把用户传入的元数据以 @Module 装饰器的形式应用到它上面，
   * 使其成为与普通 NestJS 模块等价的模块类。
   *
   * @param metadata - 测试模块元数据。
   * @returns 装饰后的根模块类。
   */
  private createModule(metadata: ModuleMetadata) {
    class RootTestModule {}
    Module(metadata)(RootTestModule);
    return RootTestModule;
  }

  /** 应用全局日志器：未显式设置时使用静默的 TestingLogger */
  private applyLogger() {
    Logger.overrideLogger(this.testingLogger || new TestingLogger());
  }
}
