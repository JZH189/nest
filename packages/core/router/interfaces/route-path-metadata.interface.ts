import { VersioningOptions } from '@nestjs/common';
import { VersionValue } from '@nestjs/common/interfaces';

/**
 * 路由路径元数据。
 *
 * 在框架中的角色：RoutePathFactory 在拼接最终路由路径（全局前缀 + 模块路径 +
 * 控制器路径 + 方法路径）以及计算版本前缀时，会把各层级的信息汇总到该结构中，
 * 作为 createFullPath / createVersionPath 等方法的输入。
 */
export interface RoutePathMetadata {
  /**
   * Controller-level path (e.g., @Controller('resource') = "resource").
   */
  ctrlPath?: string;

  /**
   * Method-level path (e.g., @Get('resource') = "resource").
   */
  methodPath?: string;

  /**
   * Global route prefix specified with the "NestApplication#setGlobalPrefix" method.
   */
  globalPrefix?: string;

  /**
   * Module-level path registered through the "RouterModule".
   */
  modulePath?: string;

  /**
   * Controller-level version (e.g., @Controller({ version: '1.0' }) = "1.0").
   */
  controllerVersion?: VersionValue;

  /**
   * Method-level version (e.g., @Version('1.0') = "1.0").
   */
  methodVersion?: VersionValue;

  /**
   * API versioning options object.
   */
  versioningOptions?: VersioningOptions;
}
