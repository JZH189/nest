import { InjectionToken, Type } from '@nestjs/common';
import { MiddlewareConfiguration } from '@nestjs/common/interfaces/middleware/middleware-configuration.interface';
import { getClassScope } from '../helpers/get-class-scope';
import { isDurable } from '../helpers/is-durable';
import { NestContainer } from '../injector/container';
import { InstanceWrapper } from '../injector/instance-wrapper';

/**
 * 中间件容器（MiddlewareContainer）：存放全部模块声明的中间件
 * 配置（configurationSets）与中间件实例包装器（middleware）的专用容器。
 *
 * 在框架中的角色：MiddlewareModule 在 loadConfiguration 阶段写入配置、
 * 在 registerMiddleware 阶段读取配置并将中间件注册到路由器。
 */
export class MiddlewareContainer {
  /** 模块 token -> （中间件 token -> 实例包装器）的映射。 */
  private readonly middleware = new Map<
    string,
    Map<InjectionToken, InstanceWrapper>
  >();
  /** 模块 token -> 该模块声明的中间件配置集合。 */
  private readonly configurationSets = new Map<
    string,
    Set<MiddlewareConfiguration>
  >();

  /**
   * @param container - 应用 IoC 容器，用于按模块 key 查找模块引用。
   */
  constructor(private readonly container: NestContainer) {}

  /**
   * 获取某个模块的中间件实例包装器集合；首次访问时从模块引用中读取。
   *
   * @param moduleKey - 模块 token。
   * @returns 该模块的中间件实例包装器映射。
   */
  public getMiddlewareCollection(
    moduleKey: string,
  ): Map<InjectionToken, InstanceWrapper> {
    if (!this.middleware.has(moduleKey)) {
      const moduleRef = this.container.getModuleByKey(moduleKey)!;
      this.middleware.set(moduleKey, moduleRef.middlewares);
    }
    return this.middleware.get(moduleKey)!;
  }

  /**
   * 获取所有模块的中间件配置集合（模块 token -> 配置集合）。
   *
   * @returns 全部中间件配置映射。
   */
  public getConfigurations(): Map<string, Set<MiddlewareConfiguration>> {
    return this.configurationSets;
  }

  /**
   * 插入某模块的中间件配置：同时为其中涉及的每个中间件类
   * 创建实例包装器（携带作用域与 durable 标记）登记到实例集合中。
   *
   * @param configList - 中间件配置列表（来自 MiddlewareBuilder.build()）。
   * @param moduleKey - 声明这些配置的模块 token。
   */
  public insertConfig(
    configList: MiddlewareConfiguration[],
    moduleKey: string,
  ) {
    const middleware = this.getMiddlewareCollection(moduleKey);
    const targetConfig = this.getTargetConfig(moduleKey)!;

    const configurations = configList || [];
    const insertMiddleware = <T extends Type<unknown>>(metatype: T) => {
      const token = metatype;
      middleware.set(
        token,
        new InstanceWrapper({
          scope: getClassScope(metatype),
          durable: isDurable(metatype),
          name: token?.name ?? token,
          metatype,
          token,
        }),
      );
    };
    configurations.forEach(config => {
      [].concat(config.middleware).map(insertMiddleware);
      targetConfig.add(config);
    });
  }

  /**
   * 获取（或初始化）指定模块的配置集合。
   *
   * @param moduleName - 模块 token。
   * @returns 该模块的中间件配置集合。
   */
  private getTargetConfig(moduleName: string) {
    if (!this.configurationSets.has(moduleName)) {
      this.configurationSets.set(
        moduleName,
        new Set<MiddlewareConfiguration>(),
      );
    }
    return this.configurationSets.get(moduleName);
  }
}
