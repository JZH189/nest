import { Type } from '../type.interface';
import { ModuleMetadata } from './module-metadata.interface';

/**
 * 定义动态模块的接口。
 *
 * @see [动态模块](https://docs.nestjs.cn/modules#dynamic-modules)
 *
 * @publicApi
 */
export interface DynamicModule extends ModuleMetadata {
  /**
   * 模块引用
   */
  module: Type<any>;

  /**
   * 当为 "true" 时，使模块成为全局作用域。
   *
   * 一旦导入到任何模块中，全局作用域模块将在所有模块中可见。
   * 此后，希望注入从全局模块导出的服务的模块不需要导入提供者模块。
   *
   * @default false
   */
  global?: boolean;
}
