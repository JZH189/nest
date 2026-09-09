import { ModuleMetadata, Type } from '@nestjs/common/interfaces';
import { MulterOptions } from './multer-options.interface';

/**
 * MulterModule 的配置选项类型，与 MulterOptions 相同
 * （存储引擎、上传目录、大小限制、文件过滤等）。
 */
export type MulterModuleOptions = MulterOptions;

/**
 * Multer 配置工厂接口（@publicApi）。
 * 在 registerAsync（useExisting/useClass）方式下，
 * 工厂类的 createMulterOptions() 返回值将作为 MULTER_MODULE_OPTIONS 注入容器。
 */
export interface MulterOptionsFactory {
  createMulterOptions(): Promise<MulterModuleOptions> | MulterModuleOptions;
}

/**
 * MulterModule 异步注册配置（@publicApi）。
 * 三选一：useExisting（已实例化的工厂对象）、useClass（工厂类，由容器实例化）、
 * useFactory（工厂函数，依赖由 inject 声明）。
 */
export interface MulterModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  useExisting?: Type<MulterOptionsFactory>;
  useClass?: Type<MulterOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<MulterModuleOptions> | MulterModuleOptions;
  inject?: any[];
}
