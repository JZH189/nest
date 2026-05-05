import {
  FactoryProvider,
  ModuleMetadata,
  Provider,
  Type,
} from '../../interfaces';
import { DEFAULT_FACTORY_CLASS_METHOD_KEY } from '../constants';

/**
 * 必须由模块选项工厂类实现的接口。
 * 方法键根据 "FactoryClassMethodKey" 类型参数的不同而变化。
 *
 * @publicApi
 */
export type ConfigurableModuleOptionsFactory<
  ModuleOptions,
  FactoryClassMethodKey extends string,
> = Record<
  `${FactoryClassMethodKey}`,
  () => Promise<ModuleOptions> | ModuleOptions
>;

/**
 * 表示模块异步选项对象的接口。
 * 工厂方法名根据 "FactoryClassMethodKey" 类型参数的不同而变化。
 *
 * @publicApi
 */
export interface ConfigurableModuleAsyncOptions<
  ModuleOptions,
  FactoryClassMethodKey extends string =
    typeof DEFAULT_FACTORY_CLASS_METHOD_KEY,
> extends Pick<ModuleMetadata, 'imports'> {
  /**
   * 解析为现有提供者的注入令牌。该提供者必须实现相应的接口。
   */
  useExisting?: Type<
    ConfigurableModuleOptionsFactory<ModuleOptions, FactoryClassMethodKey>
  >;
  /**
   * 解析为将作为提供者实例化的类的注入令牌。
   * 该类必须实现相应的接口。
   */
  useClass?: Type<
    ConfigurableModuleOptionsFactory<ModuleOptions, FactoryClassMethodKey>
  >;
  /**
   * 返回选项（或解析为选项的 Promise）的函数，用于配置模块。
   */
  useFactory?: (...args: any[]) => Promise<ModuleOptions> | ModuleOptions;
  /**
   * 工厂可以注入的依赖项。
   */
  inject?: FactoryProvider['inject'];
  /**
   * 父模块的提供者列表，将被过滤以仅提供 'inject' 数组所需的必要提供者。
   * 这对于将选项传递给嵌套异步模块很有用。
   */
  provideInjectionTokensFrom?: Provider[];
}
