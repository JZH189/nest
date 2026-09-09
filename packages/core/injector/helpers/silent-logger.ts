import { Logger } from '@nestjs/common';

const noop = () => {};
/**
 * 静默日志器：继承 Logger 但将所有日志方法替换为空操作。
 * 用于需要完全关闭日志输出的场景（如内部核心模块的初始化）。
 */
export class SilentLogger extends Logger {
  log = noop;
  error = noop;
  warn = noop;
  debug = noop;
  verbose = noop;
  fatal = noop;
  setLogLevels = noop;
}
