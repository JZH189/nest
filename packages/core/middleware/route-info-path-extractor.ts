import { VersioningType } from '@nestjs/common';
import {
  RouteInfo,
  VersioningOptions,
  VersionValue,
} from '@nestjs/common/interfaces';
import {
  addLeadingSlash,
  stripEndSlash,
} from '@nestjs/common/utils/shared.utils';
import { ApplicationConfig } from '../application-config';
import { ExcludeRouteMetadata } from '../router/interfaces/exclude-route-metadata.interface';
import { isRouteExcluded } from '../router/utils';
import { RoutePathFactory } from './../router/route-path-factory';

/**
 * 路由信息路径提取器（RouteInfoPathExtractor）：把 RouteInfo
 * 展开为底层路由器上需要挂载中间件的实际路径集合。
 *
 * 在框架中的角色：MiddlewareModule 注册中间件、MiddlewareBuilder
 * 处理 exclude 时，借助本类把全局前缀（globalPrefix）、URI 版本前缀、
 * 通配符以及被排除路由统一换算成具体路径。
 */
export class RouteInfoPathExtractor {
  private readonly routePathFactory: RoutePathFactory;
  /** 全局前缀路径（形如 "/api"），无前缀时为空串。 */
  private readonly prefixPath: string;
  /** 排除全局前缀的路由列表。 */
  private readonly excludedGlobalPrefixRoutes: ExcludeRouteMetadata[];
  /** URI 版本化配置（仅 URI 类型参与路径计算）。 */
  private readonly versioningConfig?: VersioningOptions;

  /**
   * @param applicationConfig - 应用配置，提供全局前缀、排除路由与版本化配置。
   */
  constructor(private readonly applicationConfig: ApplicationConfig) {
    this.routePathFactory = new RoutePathFactory(applicationConfig);
    this.prefixPath = stripEndSlash(
      addLeadingSlash(this.applicationConfig.getGlobalPrefix()),
    );
    this.excludedGlobalPrefixRoutes =
      this.applicationConfig.getGlobalPrefixOptions().exclude!;
    this.versioningConfig = this.applicationConfig.getVersioning();
  }

  /**
   * 从路由信息中提取中间件需要挂载的全部路径：
   * 1. 计算版本路径前缀；
   * 2. 通配符路径：生成"匹配根 + 匹配所有子路径"的条目，
   *    并附加被排除全局前缀的路由；
   * 3. 非通配符路径：按前缀/版本/排除规则生成具体路径。
   *
   * @param routeInfo - 路由信息（path、method、version）。
   * @returns 需要挂载中间件的路径列表。
   */
  public extractPathsFrom({ path, method, version }: RouteInfo): string[] {
    const versionPaths = this.extractVersionPathFrom(version);

    if (this.isAWildcard(path)) {
      const entries =
        versionPaths.length > 0
          ? versionPaths
              .map(versionPath => [
                this.prefixPath + versionPath + '$',
                this.prefixPath + versionPath + addLeadingSlash(path),
              ])
              .flat()
          : this.prefixPath
            ? [this.prefixPath + '$', this.prefixPath + addLeadingSlash(path)]
            : [addLeadingSlash(path)];

      return Array.isArray(this.excludedGlobalPrefixRoutes)
        ? [
            ...entries,
            ...this.excludedGlobalPrefixRoutes
              .map(route =>
                Array.isArray(versionPaths) && versionPaths.length > 0
                  ? versionPaths.map(v => v + addLeadingSlash(route.path))
                  : addLeadingSlash(route.path),
              )
              .flat(),
          ]
        : entries;
    }

    return this.extractNonWildcardPathsFrom({ path, method, version });
  }

  /**
   * 从单个路由中提取实际路径（主要用于 exclude 的路径展开）；
   * 无版本号的通配符路由直接返回其本身。
   *
   * @param route - 路由信息。
   * @returns 提取出的路径列表。
   */
  public extractPathFrom(route: RouteInfo): string[] {
    if (this.isAWildcard(route.path) && !route.version) {
      return [addLeadingSlash(route.path)];
    }

    return this.extractNonWildcardPathsFrom(route);
  }

  /**
   * 判断路径是否为通配符（'*'、'/(.*)'、'/{*splat}' 等形式）。
   *
   * @param path - 待判断的路径。
   * @returns 是通配符返回 true。
   */
  private isAWildcard(path: string): boolean {
    const isSimpleWildcard = ['*', '/*', '/*/', '(.*)', '/(.*)'];
    if (isSimpleWildcard.includes(path)) {
      return true;
    }

    const wildcardRegexp = /^\/\{.*\}.*|^\/\*.*$/;
    return wildcardRegexp.test(path);
  }

  /**
   * 提取非通配符路径：先检查是否被排除全局前缀，再拼接全局前缀
   * 与 URI 版本前缀，得到最终的一条或多条路径。
   *
   * @param routeInfo - 路由信息。
   * @returns 拼装完成的路径列表。
   */
  private extractNonWildcardPathsFrom({
    path,
    method,
    version,
  }: RouteInfo): string[] {
    const versionPaths = this.extractVersionPathFrom(version);

    if (
      Array.isArray(this.excludedGlobalPrefixRoutes) &&
      isRouteExcluded(this.excludedGlobalPrefixRoutes, path, method)
    ) {
      if (!versionPaths.length) {
        return [addLeadingSlash(path)];
      }

      return versionPaths.map(
        versionPath => versionPath + addLeadingSlash(path),
      );
    }

    if (!versionPaths.length) {
      return [this.prefixPath + addLeadingSlash(path)];
    }
    return versionPaths.map(
      versionPath => this.prefixPath + versionPath + addLeadingSlash(path),
    );
  }

  /**
   * 提取 URI 版本前缀路径（如 "/v1"）；仅 URI 版本化类型时生效，
   * 支持版本数组（返回多条）。
   *
   * @param versionValue - 路由声明的版本值（单个或数组）。
   * @returns 版本前缀路径列表；无版本化时为空数组。
   */
  private extractVersionPathFrom(versionValue?: VersionValue): string[] {
    if (!versionValue || this.versioningConfig?.type !== VersioningType.URI)
      return [];

    const versionPrefix = this.routePathFactory.getVersionPrefix(
      this.versioningConfig,
    );

    if (Array.isArray(versionValue)) {
      return versionValue.map(version =>
        addLeadingSlash(versionPrefix + version.toString()),
      );
    }
    return [addLeadingSlash(versionPrefix + versionValue.toString())];
  }
}
