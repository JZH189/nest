import { TestingModuleBuilder } from '../testing-module.builder';
import { OverrideByFactoryOptions } from './override-by-factory-options.interface';

/**
 * @publicApi
 *
 * 覆盖方式接口：overrideProvider/overrideGuard/overrideInterceptor/
 * overridePipe/overrideFilter 返回的对象，用于指定被覆盖项的替代实现。
 * 三选一：直接给值（useValue）、工厂创建（useFactory）、
 * 用另一个类替换（useClass）。每个方法都返回 builder 自身以支持链式调用。
 */
export interface OverrideBy {
  /** 用一个固定值/对象作为替代实现 */
  useValue: (value: any) => TestingModuleBuilder;
  /** 用工厂函数创建替代实现，可通过 inject 声明工厂参数依赖的其他 token */
  useFactory: (options: OverrideByFactoryOptions) => TestingModuleBuilder;
  /** 用另一个类（会按其依赖正常实例化）作为替代实现 */
  useClass: (metatype: any) => TestingModuleBuilder;
}
