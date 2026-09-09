import { Logger, LoggerService } from '@nestjs/common';
import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { Injectable } from '@nestjs/common/interfaces/injectable.interface';
import { MODULE_INIT_MESSAGE } from '../helpers/messages';
import { GraphInspector } from '../inspector/graph-inspector';
import { NestContainer } from './container';
import { Injector } from './injector';
import { InternalCoreModule } from './internal-core-module/internal-core-module';
import { Module } from './module';

/**
 * 实例加载器：遍历容器中的整个模块图，创建所有 provider/injectable/controller 的实例
 *
 * 是依赖扫描（静态登记）与运行时（实例可用）之间的桥梁，工作分两个阶段：
 * 1. **原型阶段（createPrototypes）**：为所有 wrapper 预创建"原型空壳"实例，
 *    使实例在真正初始化前就可被引用（解决部分循环引用场景）
 * 2. **实例阶段（createInstances）**：并行遍历每个模块，按
 *    providers -> injectables -> controllers 的顺序调用 Injector 实例化全部组件
 *
 * 实例化过程中通过 GraphInspector 记录实例关系图；失败时会登记部分完成状态后抛出。
 */
export class InstanceLoader<TInjector extends Injector = Injector> {
  /**
   * 创建实例加载器
   *
   * @param container - IoC 容器（提供模块图）
   * @param injector - 依赖注入器（执行真正的实例化）
   * @param graphInspector - 依赖图检查器（记录实例化结果）
   * @param logger - 日志器
   */
  constructor(
    protected readonly container: NestContainer,
    protected readonly injector: TInjector,
    protected readonly graphInspector: GraphInspector,
    private logger: LoggerService = new Logger(InstanceLoader.name, {
      timestamp: true,
    }),
  ) {}

  /** 替换日志器（如应用配置了自定义 Logger 时） */
  public setLogger(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 创建所有模块依赖的实例（对外主入口）
   *
   * 处理流程：
   * 1. 先为所有 wrapper 创建原型空壳
   * 2. 再并行实例化所有模块的组件
   * 3. 失败时用 GraphInspector 登记部分完成的图后重新抛出；
   *    成功时同样检查模块图以完成 Inspector 登记
   *
   * @param modules - 待处理的模块集合（默认取容器中的全部模块）
   */
  public async createInstancesOfDependencies(
    modules: Map<string, Module> = this.container.getModules(),
  ) {
    this.createPrototypes(modules);

    try {
      await this.createInstances(modules);
    } catch (err) {
      this.graphInspector.inspectModules(modules);
      this.graphInspector.registerPartial(err);
      throw err;
    }
    this.graphInspector.inspectModules(modules);
  }

  /** 第一阶段：遍历所有模块，为 provider/injectable/controller 预创建原型空壳 */
  private createPrototypes(modules: Map<string, Module>) {
    modules.forEach(moduleRef => {
      this.createPrototypesOfProviders(moduleRef);
      this.createPrototypesOfInjectables(moduleRef);
      this.createPrototypesOfControllers(moduleRef);
    });
  }

  /**
   * 第二阶段：并行实例化所有模块的组件
   * （模块间并行；模块内按 providers -> injectables -> controllers 顺序）
   * 内部核心模块不打印初始化日志。
   */
  private async createInstances(modules: Map<string, Module>) {
    await Promise.all(
      [...modules.values()].map(async moduleRef => {
        await this.createInstancesOfProviders(moduleRef);
        await this.createInstancesOfInjectables(moduleRef);
        await this.createInstancesOfControllers(moduleRef);

        const { name } = moduleRef;
        this.isModuleWhitelisted(name) &&
          this.logger.log(MODULE_INIT_MESSAGE`${name}`);
      }),
    );
  }

  /** 为模块的所有 provider 预创建原型空壳 */
  private createPrototypesOfProviders(moduleRef: Module) {
    const { providers } = moduleRef;
    providers.forEach(wrapper =>
      this.injector.loadPrototype<Injectable>(wrapper, providers),
    );
  }

  /** 并行实例化模块的所有 provider，并将结果登记到 GraphInspector */
  private async createInstancesOfProviders(moduleRef: Module) {
    const { providers } = moduleRef;
    const wrappers = [...providers.values()];
    await Promise.all(
      wrappers.map(async item => {
        await this.injector.loadProvider(item, moduleRef);
        this.graphInspector.inspectInstanceWrapper(item, moduleRef);
      }),
    );
  }

  /** 为模块的所有 controller 预创建原型空壳 */
  private createPrototypesOfControllers(moduleRef: Module) {
    const { controllers } = moduleRef;
    controllers.forEach(wrapper =>
      this.injector.loadPrototype<Controller>(wrapper, controllers),
    );
  }

  /** 并行实例化模块的所有 controller，并将结果登记到 GraphInspector */
  private async createInstancesOfControllers(moduleRef: Module) {
    const { controllers } = moduleRef;
    const wrappers = [...controllers.values()];
    await Promise.all(
      wrappers.map(async item => {
        await this.injector.loadController(item, moduleRef);
        this.graphInspector.inspectInstanceWrapper(item, moduleRef);
      }),
    );
  }

  /** 为模块的所有增强器（injectables）预创建原型空壳 */
  private createPrototypesOfInjectables(moduleRef: Module) {
    const { injectables } = moduleRef;
    injectables.forEach(wrapper =>
      this.injector.loadPrototype(wrapper, injectables),
    );
  }

  /** 并行实例化模块的所有增强器（injectables），并将结果登记到 GraphInspector */
  private async createInstancesOfInjectables(moduleRef: Module) {
    const { injectables } = moduleRef;
    const wrappers = [...injectables.values()];
    await Promise.all(
      wrappers.map(async item => {
        await this.injector.loadInjectable(item, moduleRef);
        this.graphInspector.inspectInstanceWrapper(item, moduleRef);
      }),
    );
  }

  /** 内部核心模块不参与"模块初始化完成"日志输出 */
  private isModuleWhitelisted(name: string): boolean {
    return name !== InternalCoreModule.name;
  }
}
