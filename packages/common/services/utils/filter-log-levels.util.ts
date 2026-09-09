import { LOG_LEVELS, LogLevel } from '../logger.service';
import { isLogLevel } from './is-log-level.util';

/**
 * 解析可读的日志级别配置字符串为 LogLevel 数组。
 * 支持三种格式：
 * - `">=warn"` / `">debug"`：选取指定级别及以上（`>` 为严格大于）的所有级别；
 * - `"log,error"`：逗号分隔的多个级别；
 * - `"debug"`：单个级别；无法识别时返回全部级别。
 *
 * @param parseableString 待解析的日志级别字符串
 * @returns 解析出的日志级别数组
 * @throws 当 `>` 语法中出现未知日志级别时抛出 `Error`
 *
 * @publicApi
 */
export function filterLogLevels(parseableString = ''): LogLevel[] {
  const sanitizedString = parseableString.replaceAll(' ', '').toLowerCase();

  if (sanitizedString[0] === '>') {
    const orEqual = sanitizedString[1] === '=';

    const logLevelIndex = (LOG_LEVELS as string[]).indexOf(
      sanitizedString.substring(orEqual ? 2 : 1),
    );

    if (logLevelIndex === -1) {
      throw new Error(`parse error (unknown log level): ${sanitizedString}`);
    }

    return LOG_LEVELS.slice(orEqual ? logLevelIndex : logLevelIndex + 1);
  } else if (sanitizedString.includes(',')) {
    return sanitizedString.split(',').filter(isLogLevel);
  }

  return isLogLevel(sanitizedString) ? [sanitizedString] : LOG_LEVELS;
}
