import { ErrorHttpStatusCode } from '../../utils/http-error-by-code.util';
import { FileValidator } from './file-validator.interface';

/**
 * ParseFile 管道的配置选项
 *
 * @publicApi
 */
export interface ParseFileOptions {
  /** 应用于上传文件的校验器列表（如 FileTypeValidator、MaxFileSizeValidator） */
  validators?: FileValidator[];
  /** 校验失败时在响应中使用的 HTTP 状态码（默认 400 Bad Request） */
  errorHttpStatusCode?: ErrorHttpStatusCode;
  /** 校验失败时返回要抛出的异常对象的工厂函数 */
  exceptionFactory?: (error: string) => any;

  /**
   * 定义文件参数是否为必需。
   * @default true
   */
  fileIsRequired?: boolean;
}
