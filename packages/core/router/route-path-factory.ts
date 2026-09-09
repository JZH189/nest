import {
  RequestMethod,
  VERSION_NEUTRAL,
  VersioningOptions,
  VersioningType,
  flatten,
} from '@nestjs/common';
import { VersionValue } from '@nestjs/common/interfaces';
import {
  addLeadingSlash,
  isUndefined,
  stripEndSlash,
} from '@nestjs/common/utils/shared.utils';
import { ApplicationConfig } from '../application-config';
import { RoutePathMetadata } from './interfaces/route-path-metadata.interface';
import { isRouteExcluded } from './utils';

/**
 * 路径工厂：负责把各层级路径片段（版本前缀、全局前缀、模块路径、控制器路径、
 * 方法路径）拼接成最终注册到 HTTP 适配器上的路由路径。
 *
 * 在框架中的角色：RouterExplorer 在扫描控制器并注册路由时，会构造 RoutePathMetadata
 * 并调用本类的 create 方法得到最终的路径数组（同一个方法可能因声明了多个版本而
 * 对应多条路径）。
 */
export class RoutePathFactory {
  constructor(private readonly applicationConfig: ApplicationConfig) {}

  /**
   * 根据路径元数据计算最终的路由路径列表。
   *
   * 拼接顺序为：URI 版本前缀 -> 模块路径 -> 控制器路径 -> 方法路径 -> 全局前缀。
   *
   * @param metadata - 汇总了各层级路径与版本信息的元数据。
   * @param requestMethod - HTTP 请求方法，用于判断该路径是否被排除在全局前缀之外。
   * @returns 规范化后的路径数组（带前导斜杠、去尾部斜杠）。
   */
  public create(
    metadata: RoutePathMetadata,
    requestMethod?: RequestMethod,
  ): string[] {
    let paths = [''];

    // 1. 若启用 URI 版本控制，则为每个版本生成对应的版本前缀路径（/v1、/v2 ...）
    const versionOrVersions = this.getVersion(metadata);
    if (
      versionOrVersions &&
      metadata.versioningOptions?.type === VersioningType.URI
    ) {
      const versionPrefix = this.getVersionPrefix(metadata.versioningOptions);

      if (Array.isArray(versionOrVersions)) {
        // 多个版本：对每个已有路径分别追加各版本前缀，形成笛卡尔积后展平
        paths = flatten(
          paths.map(path =>
            versionOrVersions.map(version =>
              // Version Neutral - Do not include version in URL
              version === VERSION_NEUTRAL
                ? path
                : `${path}/${versionPrefix}${version}`,
            ),
          ),
        );
      } else {
        // 单个版本：直接追加；VERSION_NEUTRAL 表示不参与 URI 版本控制，不加前缀
        // Version Neutral - Do not include version in URL
        if (versionOrVersions !== VERSION_NEUTRAL) {
          paths = paths.map(
            path => `${path}/${versionPrefix}${versionOrVersions}`,
          );
        }
      }
    }

    // 2. 依次追加模块路径、控制器路径、方法路径（支持数组片段，形成多路径）
    paths = this.appendToAllIfDefined(paths, metadata.modulePath);
    paths = this.appendToAllIfDefined(paths, metadata.ctrlPath);
    paths = this.appendToAllIfDefined(paths, metadata.methodPath);

    // 3. 追加全局前缀（被 exclude 排除的路由不加前缀）
    if (metadata.globalPrefix) {
      paths = paths.map(path => {
        if (
          this.isExcludedFromGlobalPrefix(
            path,
            requestMethod,
            versionOrVersions,
            metadata.versioningOptions,
          )
        ) {
          return path;
        }
        return stripEndSlash(metadata.globalPrefix || '') + path;
      });
    }

    // 4. 规范化：统一添加前导斜杠，并去掉尾部斜杠（根路径 '/' 除外）
    return paths
      .map(path => addLeadingSlash(path || '/'))
      .map(path => (path !== '/' ? stripEndSlash(path) : path));
  }

  /**
   * 获取生效的版本值：方法级版本（@Version）优先于控制器级版本。
   *
   * @param metadata - 路由路径元数据。
   * @returns 方法级或控制器级版本值（可能是单个值或数组）。
   */
  public getVersion(metadata: RoutePathMetadata) {
    // The version will be either the path version or the controller version,
    // with the pathVersion taking priority.
    return metadata.methodVersion || metadata.controllerVersion;
  }

  /**
   * 计算 URI 版本前缀字符串（默认 "v"）。
   *
   * @param versioningOptions - 版本控制配置。
   * @returns 前缀字符串；prefix 配置为 false 时返回空字符串，
   *          配置为自定义字符串时返回该字符串，否则返回默认的 "v"。
   */
  public getVersionPrefix(versioningOptions: VersioningOptions): string {
    const defaultPrefix = 'v';
    if (versioningOptions.type === VersioningType.URI) {
      if (versioningOptions.prefix === false) {
        return '';
      } else if (versioningOptions.prefix !== undefined) {
        return versioningOptions.prefix;
      }
    }
    return defaultPrefix;
  }

  /**
   * 若路径片段存在，则把它追加到所有已有路径末尾（片段为数组时会展开成多条路径）。
   *
   * @param paths - 现有路径数组。
   * @param fragmentToAppend - 待追加的路径片段（可为字符串、字符串数组或 undefined）。
   * @returns 追加片段后的新路径数组。
   */
  public appendToAllIfDefined(
    paths: string[],
    fragmentToAppend: string | string[] | undefined,
  ): string[] {
    if (!fragmentToAppend) {
      return paths;
    }
    const concatPaths = (a: string, b: string) =>
      stripEndSlash(a) + addLeadingSlash(b);

    if (Array.isArray(fragmentToAppend)) {
      const paths2dArray = paths.map(path =>
        fragmentToAppend.map(fragment => concatPaths(path, fragment)),
      );
      return flatten(paths2dArray);
    }
    return paths.map(path => concatPaths(path, fragmentToAppend));
  }

  /**
   * 判断给定路径是否被排除在全局前缀之外（基于 setGlobalPrefix 的 exclude 配置）。
   *
   * @param path - 当前路由路径（可能带有版本前缀）。
   * @param requestMethod - HTTP 请求方法；未提供时视为不排除。
   * @param versionOrVersions - 生效的版本值，用于先剔除路径中的版本前缀再匹配。
   * @param versioningOptions - 版本控制配置。
   * @returns 若该路由命中排除规则则返回 true。
   */
  public isExcludedFromGlobalPrefix(
    path: string,
    requestMethod?: RequestMethod,
    versionOrVersions?: VersionValue,
    versioningOptions?: VersioningOptions,
  ) {
    if (isUndefined(requestMethod)) {
      return false;
    }
    const options = this.applicationConfig.getGlobalPrefixOptions();
    const excludedRoutes = options.exclude;

    if (
      versionOrVersions &&
      versionOrVersions !== VERSION_NEUTRAL &&
      versioningOptions?.type === VersioningType.URI
    ) {
      path = this.truncateVersionPrefixFromPath(
        path,
        versionOrVersions,
        versioningOptions,
      );
    }
    return (
      Array.isArray(excludedRoutes) &&
      isRouteExcluded(excludedRoutes, path, requestMethod)
    );
  }

  /**
   * 从路径开头剔除版本前缀（如 "/v1"），以便与 exclude 规则的原始路径匹配。
   *
   * @param path - 当前路径。
   * @param versionValue - 版本值，可能是字符串或版本数组（递归处理每个版本）。
   * @param versioningOptions - 版本控制配置，用于取得版本前缀。
   * @returns 剔除版本前缀后的路径；未匹配到前缀时原样返回。
   */
  private truncateVersionPrefixFromPath(
    path: string,
    versionValue: Exclude<VersionValue, typeof VERSION_NEUTRAL>,
    versioningOptions: VersioningOptions,
  ) {
    if (typeof versionValue !== 'string') {
      versionValue.forEach(version => {
        if (typeof version === 'string') {
          path = this.truncateVersionPrefixFromPath(
            path,
            version,
            versioningOptions,
          );
        }
      });
      return path;
    }

    const prefix = `/${this.getVersionPrefix(
      versioningOptions,
    )}${versionValue}`;

    return path.startsWith(prefix) ? path.replace(prefix, '') : path;
  }
}
