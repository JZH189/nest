import { randomStringGenerator } from '../../utils/random-string-generator.util';

/**
 * 为可配置模块生成一个唯一的选项注入令牌。
 * 令牌格式为 "CONFIGURABLE_MODULE_OPTIONS[<随机哈希>]"，
 * 在未显式指定 optionsInjectionToken 或 moduleName 时由 "ConfigurableModuleBuilder" 使用，
 * 以避免多个可配置模块之间的令牌冲突。
 *
 * @returns 形如 "CONFIGURABLE_MODULE_OPTIONS[xxxxxxxx]" 的令牌字符串
 */
export function generateOptionsInjectionToken() {
  const hash = randomStringGenerator();
  return `CONFIGURABLE_MODULE_OPTIONS[${hash}]`;
}
