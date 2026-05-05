/* eslint-disable @typescript-eslint/no-empty-object-type */
import { DynamicModule } from '../../interfaces';
import {
  DEFAULT_FACTORY_CLASS_METHOD_KEY,
  DEFAULT_METHOD_KEY,
} from '../constants';
import { ConfigurableModuleAsyncOptions } from './configurable-module-async-options.interface';

/**
 * 表示可配置 Nest 模块的蓝图/原型的类。
 * 此类提供用于构造动态模块的静态方法。方法名可以通过 "MethodKey" 类型参数进行控制。
 *
 * @publicApi
 */
export type ConfigurableModuleCls<
  ModuleOptions,
  MethodKey extends string = typeof DEFAULT_METHOD_KEY,
  FactoryClassMethodKey extends string =
    typeof DEFAULT_FACTORY_CLASS_METHOD_KEY,
  ExtraModuleDefinitionOptions = {},
> = {
  new (): any;
} & Record<
  `${MethodKey}`,
  (
    options: ModuleOptions & Partial<ExtraModuleDefinitionOptions>,
  ) => DynamicModule
> &
  Record<
    `${MethodKey}Async`,
    (
      options: ConfigurableModuleAsyncOptions<
        ModuleOptions,
        FactoryClassMethodKey
      > &
        Partial<ExtraModuleDefinitionOptions>,
    ) => DynamicModule
  >;
