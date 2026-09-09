import { uid } from 'uid';

/**
 * 生成一个 21 位、URL 安全的随机字符串（基于 uid 库的 nanoid 实现）。
 * 在框架内部用作唯一标识符，例如 "ConfigurableModuleBuilder" 在
 * alwaysTransient 模式下为每个动态模块生成唯一 ID。
 *
 * @returns 21 字符的随机字符串
 */
export const randomStringGenerator = () => uid(21);
