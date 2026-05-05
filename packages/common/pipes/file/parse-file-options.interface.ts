import { ErrorHttpStatusCode } from '../../utils/http-error-by-code.util';
import { FileValidator } from './file-validator.interface';

/**
 * @publicApi
 */
export interface ParseFileOptions {
  validators?: FileValidator[];
  errorHttpStatusCode?: ErrorHttpStatusCode;
  exceptionFactory?: (error: string) => any;

  /**
   * 定义文件参数是否为必需。
   * @default true
   */
  fileIsRequired?: boolean;
}
