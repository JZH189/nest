import { Abstract } from '../abstract.interface';
import { Type } from '../type.interface';
import { DynamicModule } from './dynamic-module.interface';
import { ForwardReference } from './forward-reference.interface';
import { Provider } from './provider.interface';

/**
 * 定义描述模块的属性对象的接口。
 *
 * @see [模块](https://docs.nestjs.cn/modules)
 *
 * @publicApi
 */
export interface ModuleMetadata {
  /**
   * 可选的导入模块列表，这些模块导出了此模块所需的提供者。
   */
  imports?: Array<
    Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference
  >;
  /**
   * 可选的在此模块中定义的、需要实例化的控制器列表。
   */
  controllers?: Type<any>[];
  /**
   * 可选的提供者列表，将由 Nest 注入器实例化，
   * 并且至少在此模块中共享。
   */
  providers?: Provider[];
  /**
   * 可选的从此模块提供的提供者的子集列表，
   * 应该在其导入此模块的其他模块中可用。
   */
  exports?: Array<
    | DynamicModule
    | string
    | symbol
    | Provider
    | ForwardReference
    | Abstract<any>
    | Function
  >;
}
