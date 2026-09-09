import { NestContainer } from '@nestjs/core';
import { STATIC_CONTEXT } from '@nestjs/core/injector/constants';
import {
  Injector,
  InjectorDependencyContext,
} from '@nestjs/core/injector/injector';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Module } from '@nestjs/core/injector/module';
import { MockFactory } from './interfaces';

/**
 * @publicApi
 *
 * 测试专用注入器：继承核心 Injector，在实例解析流程上加入了
 * "mock 兜底"能力——当某个依赖在容器中无法解析（例如测试模块
 * 元数据没有声明它）时，如果配置了 MockFactory（useMocker），
 * 则调用工厂生成 mock 实例并注入，而不是直接抛出错误。
 * 未配置 mocker 或工厂返回空值时仍按原逻辑抛出异常。
 */
export class TestingInjector extends Injector {
  protected mocker?: MockFactory;
  protected container: NestContainer;

  /** 设置 mock 工厂，供解析失败时兜底生成 mock 实例 */
  public setMocker(mocker: MockFactory) {
    this.mocker = mocker;
  }

  /** 注入容器引用，mock 实例需要注册到内部核心模块中 */
  public setContainer(container: NestContainer) {
    this.container = container;
  }

  /**
   * 解析组件包装器（覆写）：优先走核心注入器的正常解析逻辑，
   * 失败时尝试用 mock 工厂兜底。
   *
   * @param moduleRef - 请求解析所在的模块引用。
   * @param name - 依赖的名称/token。
   * @param dependencyContext - 依赖解析上下文（记录是谁在依赖它）。
   * @param wrapper - 目标实例包装器。
   * @param contextId - 上下文 id（请求作用域解析用），默认静态上下文。
   * @param inquirer - 依赖请求方（可选）。
   * @param keyOrIndex - 属性注入的 key 或构造参数索引（可选）。
   * @returns 解析成功或 mock 成功的实例包装器；均失败时抛出原始错误。
   */
  public async resolveComponentWrapper<T>(
    moduleRef: Module,
    name: any,
    dependencyContext: InjectorDependencyContext,
    wrapper: InstanceWrapper<T>,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
    keyOrIndex?: string | number,
  ): Promise<InstanceWrapper> {
    try {
      const existingProviderWrapper = await super.resolveComponentWrapper(
        moduleRef,
        name,
        dependencyContext,
        wrapper,
        contextId,
        inquirer,
        keyOrIndex,
      );
      return existingProviderWrapper;
    } catch (err) {
      return this.mockWrapper(err, moduleRef, name, wrapper);
    }
  }

  /**
   * 解析组件宿主（覆写）：同样在核心解析失败时尝试 mock 兜底。
   *
   * @param moduleRef - 请求解析所在的模块引用。
   * @param instanceWrapper - 待解析的实例包装器。
   * @param contextId - 上下文 id（请求作用域解析用），默认静态上下文。
   * @param inquirer - 依赖请求方（可选）。
   * @returns 解析成功或 mock 成功的实例包装器；均失败时抛出原始错误。
   */
  public async resolveComponentHost<T>(
    moduleRef: Module,
    instanceWrapper: InstanceWrapper<T>,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
  ): Promise<InstanceWrapper> {
    try {
      const existingProviderWrapper = await super.resolveComponentHost(
        moduleRef,
        instanceWrapper,
        contextId,
        inquirer,
      );
      return existingProviderWrapper;
    } catch (err) {
      return this.mockWrapper(
        err,
        moduleRef,
        instanceWrapper.name,
        instanceWrapper,
      );
    }
  }

  /**
   * mock 兜底逻辑：
   * 1. 未配置 mocker 时直接抛出原始错误；
   * 2. 调用 mock 工厂生成 mock 实例，工厂返回空值同样抛错；
   * 3. 用 mock 实例构造新的 InstanceWrapper（标记为已解析）；
   * 4. 把该 mock 以自定义 provider 的形式注册进内部核心模块并导出，
   *    使后续所有模块都能解析到这个 mock 实例。
   *
   * @param err - 核心解析时抛出的原始错误。
   * @param moduleRef - 目标模块引用。
   * @param name - 依赖的名称/token。
   * @param wrapper - 目标实例包装器。
   * @returns 包含 mock 实例的新实例包装器。
   */
  private async mockWrapper<T>(
    err: Error,
    moduleRef: Module,
    name: any,
    wrapper: InstanceWrapper<T>,
  ): Promise<InstanceWrapper> {
    if (!this.mocker) {
      throw err;
    }

    const mockedInstance = this.mocker(name);
    if (!mockedInstance) {
      throw err;
    }
    const newWrapper = new InstanceWrapper({
      name,
      isAlias: false,
      scope: wrapper.scope,
      instance: mockedInstance,
      isResolved: true,
      host: moduleRef,
      metatype: wrapper.metatype,
    });
    const internalCoreModule = this.container.getInternalCoreModuleRef();
    if (!internalCoreModule) {
      throw new Error(
        'Expected to have internal core module reference at this point.',
      );
    }

    internalCoreModule.addCustomProvider(
      {
        provide: name,
        useValue: mockedInstance,
      },
      internalCoreModule.providers,
    );
    internalCoreModule.addExportedProviderOrModule(name);
    return newWrapper;
  }
}
