/* eslint-disable @typescript-eslint/no-empty-object-type */
import { ConfigurableModuleAsyncOptions } from './configurable-module-async-options.interface';
import { ConfigurableModuleCls } from './configurable-module-cls.interface';

/**
 * 可配置模块宿主。详见各属性。
 *
 * @publicApi
 */
export interface ConfigurableModuleHost<
  ModuleOptions = Record<string, unknown>,
  MethodKey extends string = string,
  FactoryClassMethodKey extends string = string,
  ExtraModuleDefinitionOptions = {},
> {
  /**
   * 表示可配置 Nest 模块的蓝图/原型的类。
   * 此类提供用于构造动态模块的静态方法。方法名可以通过 "MethodKey" 类型参数进行控制。
   *
   * 你的模块类应该继承此类以使静态方法可用。
   *
   * @example
   * ```typescript
   * @Module({})
   * class IntegrationModule extends ConfigurableModuleCls {
   *  // ...
   * }
   * ```
   */
  ConfigurableModuleClass: ConfigurableModuleCls<
    ModuleOptions,
    MethodKey,
    FactoryClassMethodKey,
    ExtraModuleDefinitionOptions
  >;
  /**
   * 模块选项提供者令牌。可用于向宿主模块内注册的提供者注入"选项对象"。
   */
  MODULE_OPTIONS_TOKEN: string | symbol;
  /**
   * 可用于自动推断复合"异步模块选项"类型。
   * 注意：此属性不应作为值使用。
   *
   * @example
   * ```typescript
   * @Module({})
   * class IntegrationModule extends ConfigurableModuleCls {
   *  static module = initializer(IntegrationModule);
   *
   * static registerAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
   *  return super.registerAsync(options);
   * }
   * ```
   */
  ASYNC_OPTIONS_TYPE: ConfigurableModuleAsyncOptions<
    ModuleOptions,
    FactoryClassMethodKey
  > &
    Partial<ExtraModuleDefinitionOptions>;
  /**
   * 可用于自动推断复合"模块选项"类型（选项接口 + 额外模块定义选项）。
   * 注意：此属性不应作为值使用。
   *
   * @example
   * ```typescript
   * @Module({})
   * class IntegrationModule extends ConfigurableModuleCls {
   *  static module = initializer(IntegrationModule);
   *
   * static register(options: typeof OPTIONS_TYPE): DynamicModule {
   *  return super.register(options);
   * }
   * ```
   */
  OPTIONS_TYPE: ModuleOptions & Partial<ExtraModuleDefinitionOptions>;
}
