/**
 * "ConfigurableModuleBuilder" 生成的同步静态方法的默认名称。
 * 即动态模块默认暴露 "register(options)" 方法。
 */
export const DEFAULT_METHOD_KEY = 'register';
/**
 * 异步配置工厂类的默认方法名。
 * 使用 useExisting/useClass 时，会调用工厂类的 "create" 方法获取模块选项。
 */
export const DEFAULT_FACTORY_CLASS_METHOD_KEY = 'create';

/**
 * 异步配置静态方法的后缀：同步方法名 + "Async"，
 * 如 "register" -> "registerAsync"。
 */
export const ASYNC_METHOD_SUFFIX = 'Async';
/**
 * "alwaysTransient" 模式下使用的提供者令牌，
 * 其值是随机生成的字符串，用于保证每次构造动态模块时都产生"唯一"的模块实例。
 */
export const CONFIGURABLE_MODULE_ID = 'CONFIGURABLE_MODULE_ID';

/**
 * List of keys that are specific to ConfigurableModuleAsyncOptions
 * and should be excluded when extracting user-defined extras.
 */
export const ASYNC_OPTIONS_METADATA_KEYS = [
  'useFactory',
  'useClass',
  'useExisting',
  'inject',
  'imports',
  'provideInjectionTokensFrom',
] as const;
