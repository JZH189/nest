import {
  MODULE_PATH,
  PATH_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import {
  RouteInfo,
  Type,
  VERSION_NEUTRAL,
  VersionValue,
} from '@nestjs/common/interfaces';
import {
  addLeadingSlash,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { ApplicationConfig } from '../application-config';
import { NestContainer } from '../injector/container';
import { Module } from '../injector/module';
import { MetadataScanner } from '../metadata-scanner';
import { PathsExplorer, RouteDefinition } from '../router/paths-explorer';
import { targetModulesByContainer } from '../router/router-module';

/**
 * 路由映射器（RoutesMapper）：把 MiddlewareBuilder 中出现的各种
 * "路由形态"（路径字符串、RouteInfo 对象、controller 类）统一
 * 解析为 RouteInfo 列表。
 *
 * 在框架中的角色：forRoutes() 支持传 controller 类，本类借助
 * PathsExplorer 扫描其全部处理器方法，并结合模块路径前缀与版本
 * 元数据，生成完整的路由信息供中间件注册使用。
 */
export class RoutesMapper {
  private readonly pathsExplorer: PathsExplorer;

  /**
   * @param container - 应用 IoC 容器（用于查找 controller 所属模块）。
   * @param applicationConfig - 应用配置（用于获取版本化配置）。
   */
  constructor(
    private readonly container: NestContainer,
    private readonly applicationConfig: ApplicationConfig,
  ) {
    this.pathsExplorer = new PathsExplorer(new MetadataScanner());
  }

  /**
   * 将任意形式的路由参数映射为 RouteInfo 列表：
   * 1. 字符串：按路径处理（方法默认为 ALL）；
   * 2. 已是 RouteInfo 对象：规范化路径后直接返回；
   * 3. controller 类：扫描其全部方法展开为路由列表。
   *
   * @param controllerOrRoute - 路径字符串、RouteInfo 或 controller 类。
   * @returns 解析出的 RouteInfo 数组。
   */
  public mapRouteToRouteInfo(
    controllerOrRoute: Type<any> | RouteInfo | string,
  ): RouteInfo[] {
    if (isString(controllerOrRoute)) {
      return this.getRouteInfoFromPath(controllerOrRoute);
    }
    const routePathOrPaths = this.getRoutePath(controllerOrRoute);
    if (this.isRouteInfo(routePathOrPaths, controllerOrRoute)) {
      return this.getRouteInfoFromObject(controllerOrRoute);
    }

    return this.getRouteInfoFromController(
      controllerOrRoute,
      routePathOrPaths!,
    );
  }

  /**
   * 从纯路径字符串构造 RouteInfo（请求方法默认 -1，即全部方法）。
   *
   * @param routePath - 路径字符串。
   * @returns 包含单个 RouteInfo 的数组。
   */
  private getRouteInfoFromPath(routePath: string): RouteInfo[] {
    const defaultRequestMethod = -1;
    return [
      {
        path: addLeadingSlash(routePath),
        method: defaultRequestMethod as any,
      },
    ];
  }

  /**
   * 规范化 RouteInfo 对象（补全路径前导斜杠、透传版本）。
   *
   * @param routeInfoObject - 用户传入的 RouteInfo。
   * @returns 规范化后的 RouteInfo 数组。
   */
  private getRouteInfoFromObject(routeInfoObject: RouteInfo): RouteInfo[] {
    const routeInfo: RouteInfo = {
      path: addLeadingSlash(routeInfoObject.path),
      method: routeInfoObject.method,
    };

    if (routeInfoObject.version) {
      routeInfo.version = routeInfoObject.version;
    }
    return [routeInfo];
  }

  /**
   * 从 controller 类展开出全部路由信息：
   * 1. 用 PathsExplorer 扫描所有处理器方法；
   * 2. 取 controller 与宿主模块的路径前缀、版本元数据；
   * 3. 将方法路径逐一拼接为完整 RouteInfo（版本数组会展开为多条）。
   *
   * @param controller - controller 类。
   * @param routePath - controller 的路径前缀（来自 PATH_METADATA）。
   * @returns 展开后的 RouteInfo 数组。
   */
  private getRouteInfoFromController(
    controller: Type<any>,
    routePath: string,
  ): RouteInfo[] {
    const controllerPaths = this.pathsExplorer.scanForPaths(
      Object.create(controller),
      controller.prototype,
    );
    const controllerVersion = this.getVersionMetadata(controller);
    const versioningConfig = this.applicationConfig.getVersioning();
    const moduleRef = this.getHostModuleOfController(controller);
    const modulePath = this.getModulePath(moduleRef?.metatype);

    const concatPaths = <T>(acc: T[], currentValue: T[]) =>
      acc.concat(currentValue);

    const toUndefinedIfNeural = (version: VersionValue) =>
      version === VERSION_NEUTRAL ? undefined : version;

    const toRouteInfo = (item: RouteDefinition, prefix: string) =>
      item.path?.flatMap(p => {
        let endpointPath = modulePath ?? '';
        endpointPath += this.normalizeGlobalPath(prefix) + addLeadingSlash(p);

        const routeInfo: RouteInfo = {
          path: endpointPath,
          method: item.requestMethod,
        };
        const version = item.version ?? controllerVersion;
        if (version && versioningConfig) {
          if (typeof version !== 'string' && Array.isArray(version)) {
            return version.map(v => ({
              ...routeInfo,
              version: toUndefinedIfNeural(v),
            }));
          }
          routeInfo.version = toUndefinedIfNeural(version);
        }

        return routeInfo;
      });

    return ([] as string[])
      .concat(routePath)
      .map(routePath =>
        controllerPaths
          .map(item => toRouteInfo(item, routePath))
          .reduce(concatPaths, []),
      )
      .reduce(concatPaths, []);
  }

  /**
   * 类型守卫：判断传入对象是否为 RouteInfo（依据其不含 PATH_METADATA
   * 即 path 为 undefined 来区分对象与类）。
   *
   * @param path - 从对象上读取到的路径元数据。
   * @param objectOrClass - 待判断的对象或类。
   * @returns 是 RouteInfo 时返回 true。
   */
  private isRouteInfo(
    path: string | string[] | undefined,
    objectOrClass: Function | RouteInfo,
  ): objectOrClass is RouteInfo {
    return isUndefined(path);
  }

  /**
   * 规范化全局路径前缀：根路径 '/' 归一为空串，其余补前导斜杠。
   *
   * @param path - 原始前缀路径。
   * @returns 规范化后的前缀。
   */
  private normalizeGlobalPath(path: string): string {
    const prefix = addLeadingSlash(path);
    return prefix === '/' ? '' : prefix;
  }

  /**
   * 读取路由（类或对象）上的 PATH_METADATA 路径元数据。
   *
   * @param route - controller 类或 RouteInfo 对象。
   * @returns 路径元数据；对象形式（无该元数据）时返回 undefined。
   */
  private getRoutePath(route: Type<any> | RouteInfo): string | undefined {
    return Reflect.getMetadata(PATH_METADATA, route);
  }

  /**
   * 查找 controller 所属的宿主模块引用（用于拼接模块级路径前缀）。
   *
   * @param metatype - controller 类。
   * @returns 宿主模块引用；未找到时返回 undefined。
   */
  private getHostModuleOfController(
    metatype: Type<unknown>,
  ): Module | undefined {
    if (!metatype) {
      return;
    }
    const modulesContainer = this.container.getModules();
    const moduleRefsSet = targetModulesByContainer.get(modulesContainer);
    if (!moduleRefsSet) {
      return;
    }

    const modules = Array.from(modulesContainer.values()).filter(moduleRef =>
      moduleRefsSet.has(moduleRef),
    );
    return modules.find(({ controllers }) => controllers.has(metatype));
  }

  /**
   * 读取宿主模块的路径前缀元数据（MODULE_PATH），
   * 兼容按应用 id 区分的多应用元数据键。
   *
   * @param metatype - 模块类。
   * @returns 模块路径前缀；未声明时返回 undefined。
   */
  private getModulePath(
    metatype: Type<unknown> | undefined,
  ): string | undefined {
    if (!metatype) {
      return;
    }
    const modulesContainer = this.container.getModules();
    const modulePath = Reflect.getMetadata(
      MODULE_PATH + modulesContainer.applicationId,
      metatype,
    );
    return modulePath ?? Reflect.getMetadata(MODULE_PATH, metatype);
  }

  /**
   * 读取版本元数据：优先取 VERSION_METADATA，
   * 未声明时回退到全局默认版本。
   *
   * @param metatype - controller 类或处理器方法。
   * @returns 版本值；未启用版本化时返回 undefined。
   */
  private getVersionMetadata(
    metatype: Type<unknown> | Function,
  ): VersionValue | undefined {
    const versioningConfig = this.applicationConfig.getVersioning();
    if (versioningConfig) {
      return (
        Reflect.getMetadata(VERSION_METADATA, metatype) ??
        versioningConfig.defaultVersion
      );
    }
  }
}
