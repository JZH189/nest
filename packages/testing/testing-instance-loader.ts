import { InstanceLoader } from '@nestjs/core/injector/instance-loader';
import { Module } from '@nestjs/core/injector/module';
import { MockFactory } from './interfaces';
import { TestingInjector } from './testing-injector';

/**
 * 测试专用实例加载器：继承核心 InstanceLoader，把泛型注入器
 * 固定为 TestingInjector，从而在实例化阶段获得 mock 兜底能力。
 * 在创建所有依赖实例之前，先为注入器补充容器引用与 mock 工厂。
 */
export class TestingInstanceLoader extends InstanceLoader<TestingInjector> {
  /**
   * 创建所有模块的依赖实例（覆写）：先配置注入器（容器 + mocker），
   * 再走核心的实例化流程（实例化 providers/controllers）。
   *
   * @param modules - 要实例化的模块集合，默认取容器中的全部模块。
   * @param mocker - 可选的 mock 工厂，解析失败的依赖将用它生成 mock。
   */
  public async createInstancesOfDependencies(
    modules: Map<string, Module> = this.container.getModules(),
    mocker?: MockFactory,
  ): Promise<void> {
    this.injector.setContainer(this.container);
    mocker && this.injector.setMocker(mocker);
    await super.createInstancesOfDependencies();
  }
}
