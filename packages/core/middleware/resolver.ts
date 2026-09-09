import { InjectionToken } from '@nestjs/common';
import { Injector } from '../injector/injector';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';
import { MiddlewareContainer } from './container';

/**
 * 中间件解析器（MiddlewareResolver）：负责把中间件容器中登记的
 * 中间件类真正实例化（触发其依赖注入）。
 *
 * 在框架中的角色：MiddlewareModule 在 resolveMiddleware 阶段按模块
 * 调用本类，将每个中间件的 InstanceWrapper 交给注入器完成实例加载。
 */
export class MiddlewareResolver {
  /**
   * @param middlewareContainer - 中间件容器，提供中间件实例包装器集合。
   * @param injector - 注入器，负责加载中间件实例。
   */
  constructor(
    private readonly middlewareContainer: MiddlewareContainer,
    private readonly injector: Injector,
  ) {}

  /**
   * 并发解析某个模块中全部中间件的实例。
   *
   * @param moduleRef - 目标模块引用。
   * @param moduleName - 目标模块 token。
   */
  public async resolveInstances(moduleRef: Module, moduleName: string) {
    const middlewareMap =
      this.middlewareContainer.getMiddlewareCollection(moduleName);
    const resolveInstance = async (wrapper: InstanceWrapper) =>
      this.resolveMiddlewareInstance(wrapper, middlewareMap, moduleRef);
    await Promise.all([...middlewareMap.values()].map(resolveInstance));
  }

  /**
   * 解析单个中间件实例（委托给注入器的 loadMiddleware，
   * 会递归解析中间件自身的构造函数依赖）。
   *
   * @param wrapper - 中间件实例包装器。
   * @param middlewareMap - 所在模块的中间件包装器集合。
   * @param moduleRef - 所属模块引用。
   */
  private async resolveMiddlewareInstance(
    wrapper: InstanceWrapper,
    middlewareMap: Map<InjectionToken, InstanceWrapper>,
    moduleRef: Module,
  ) {
    await this.injector.loadMiddleware(wrapper, middlewareMap, moduleRef);
  }
}
