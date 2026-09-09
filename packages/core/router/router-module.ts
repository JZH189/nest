import { DynamicModule, Inject, Module, Type } from '@nestjs/common';
import { MODULE_PATH } from '@nestjs/common/constants';
import { normalizePath } from '@nestjs/common/utils/shared.utils';
import { Module as ModuleClass } from '../injector/module';
import { ModulesContainer } from '../injector/modules-container';
import { Routes, RouteTree } from './interfaces';
import { flattenRoutePaths } from './utils';

/**
 * RouterModule 依赖注入令牌：持有 register 传入的路由树配置（Routes）。
 */
export const ROUTES = Symbol('ROUTES');

/**
 * 容器 -> 已注册RouterModule 路由的模块集合缓存。
 * 用于追踪哪些模块被显式纳入了路由树（如懒加载模块的判断）。
 */
export const targetModulesByContainer = new WeakMap<
  ModulesContainer,
  WeakSet<ModuleClass>
>();

/**
 * 路由模块：允许以树形结构声明模块的挂载路径。
 *
 * 在框架中的角色：通过 RouterModule.register([...]) 配置 RouteTree，
 * 框架会为每个模块在其类上定义 MODULE_PATH 元数据；RoutesResolver 注册路由时
 * 读取该元数据作为模块路径前缀，实现"模块 -> 路径"的层级映射。
 *
 * @publicApi
 */
@Module({})
export class RouterModule {
  /**
   * 构造时深克隆路由树并立即初始化：为每个模块注册路径元数据。
   *
   * @param modulesContainer - 模块容器。
   * @param routes - register 传入的路由树。
   */
  constructor(
    private readonly modulesContainer: ModulesContainer,
    @Inject(ROUTES) private readonly routes: Routes,
  ) {
    // 克隆传入的路由树，避免用户在注册后修改配置对象影响框架内部状态
    this.routes = this.deepCloneRoutes(routes) as Routes;
    this.initialize();
  }

  /**
   * 静态注册方法：把路由树以值提供者（ROUTES）的方式注入 RouterModule。
   *
   * @param routes - 路由树声明。
   * @returns 动态模块定义。
   */
  static register(routes: Routes): DynamicModule {
    return {
      module: RouterModule,
      providers: [
        {
          provide: ROUTES,
          useValue: routes,
        },
      ],
    };
  }

  /** 递归克隆路由树：模块类型原样保留，RouteTree 节点逐层浅拷贝并克隆 children。 */
  private deepCloneRoutes(
    routes: (RouteTree | Type<any>)[],
  ): (RouteTree | Type<any>)[] {
    return routes.map((routeOrType: Type<any> | RouteTree) => {
      if (typeof routeOrType === 'function') {
        return routeOrType;
      }
      if (routeOrType.children) {
        return {
          ...routeOrType,
          children: this.deepCloneRoutes(routeOrType.children),
        };
      }
      return { ...routeOrType };
    });
  }

  /** 展平路由树，为每个路由节点规范化路径并注册模块路径元数据、更新缓存。 */
  private initialize() {
    const flattenedRoutes = flattenRoutePaths(this.routes);
    flattenedRoutes.forEach(route => {
      const modulePath = normalizePath(route.path);
      this.registerModulePathMetadata(route.module, modulePath);
      this.updateTargetModulesCache(route.module);
    });
  }

  /** 在模块类上定义带应用 ID 的 MODULE_PATH 元数据，供 RoutesResolver 读取。 */
  private registerModulePathMetadata(
    moduleCtor: Type<unknown>,
    modulePath: string,
  ) {
    Reflect.defineMetadata(
      MODULE_PATH + this.modulesContainer.applicationId,
      modulePath,
      moduleCtor,
    );
  }

  /** 把该模块加入 targetModulesByContainer 缓存，标记它已被路由树显式注册。 */
  private updateTargetModulesCache(moduleCtor: Type<unknown>) {
    let moduleClassSet: WeakSet<ModuleClass>;
    if (targetModulesByContainer.has(this.modulesContainer)) {
      moduleClassSet = targetModulesByContainer.get(this.modulesContainer)!;
    } else {
      moduleClassSet = new WeakSet<ModuleClass>();
      targetModulesByContainer.set(this.modulesContainer, moduleClassSet);
    }
    const moduleRef = Array.from(this.modulesContainer.values()).find(
      item => item?.metatype === moduleCtor,
    );
    if (!moduleRef) {
      return;
    }
    moduleClassSet.add(moduleRef);
  }
}
