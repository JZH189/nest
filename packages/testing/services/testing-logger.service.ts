import { ConsoleLogger } from '@nestjs/common';

/**
 * @publicApi
 *
 * 测试专用日志器：继承 ConsoleLogger，但把 log/warn/debug/verbose
 * 全部静默（空实现），只保留 error 输出——保证测试输出干净，
 * 同时不掩盖真正的错误日志。这是 createTestingModule 未显式
 * setLogger 时的默认日志器。
 */
export class TestingLogger extends ConsoleLogger {
  constructor() {
    super('Testing');
  }

  /** 静默普通日志 */
  log(message: string) {}
  /** 静默警告日志 */
  warn(message: string) {}
  /** 静默调试日志 */
  debug(message: string) {}
  /** 静默详细日志 */
  verbose(message: string) {}
  /** 错误日志照常输出，便于排查测试失败原因 */
  error(message: string, ...optionalParams: any[]) {
    return super.error(message, ...optionalParams);
  }
}
