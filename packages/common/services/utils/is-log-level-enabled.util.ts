import { LogLevel } from '../logger.service';

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/**
 * 检查目标级别是否已启用。
 * @param targetLevel 目标级别
 * @param logLevels 已启用日志级别的数组
 */
export function isLogLevelEnabled(
  targetLevel: LogLevel,
  logLevels: LogLevel[] | undefined,
): boolean {
  if (!logLevels || (Array.isArray(logLevels) && logLevels?.length === 0)) {
    return false;
  }
  if (logLevels.includes(targetLevel)) {
    return true;
  }

  let highestLogLevelValue = -Infinity;
  for (const level of logLevels) {
    const v = LOG_LEVEL_VALUES[level];
    if (v > highestLogLevelValue) highestLogLevelValue = v;
  }

  const targetLevelValue = LOG_LEVEL_VALUES[targetLevel];
  return targetLevelValue >= highestLogLevelValue;
}
