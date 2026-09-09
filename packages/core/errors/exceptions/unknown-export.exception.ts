import { UNKNOWN_EXPORT_MESSAGE } from '../messages';
import { RuntimeException } from './runtime.exception';

/**
 * 模块试图导出一个不属于其 providers/imports 的 provider 或模块时抛出。
 */
export class UnknownExportException extends RuntimeException {
  constructor(token: string | symbol, moduleName: string) {
    super(UNKNOWN_EXPORT_MESSAGE(token, moduleName));
  }
}
