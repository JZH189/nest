import { LOG_LEVELS, LogLevel } from '../logger.service';

/**
 * 判断给定值是否为合法的日志级别（'verbose'~'fatal' 之一），
 * 常用于过滤用户输入的日志级别配置
 *
 * @param maybeLogLevel 待检查的值
 * @returns 合法日志级别则返回 `true`（类型收窄为 LogLevel）
 *
 * @publicApi
 */
export function isLogLevel(maybeLogLevel: any): maybeLogLevel is LogLevel {
  return LOG_LEVELS.includes(maybeLogLevel);
}
