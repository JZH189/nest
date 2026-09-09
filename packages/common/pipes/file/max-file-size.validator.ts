import { FileValidatorContext } from './file-validator-context.interface';
import { FileValidator } from './file-validator.interface';
import { IFile } from './interfaces';

type MaxFileSizeValidatorContext = FileValidatorContext<
  Omit<MaxFileSizeValidatorOptions, 'errorMessage' | 'message'>
>;

/**
 * MaxFileSizeValidator 的配置选项
 */
export type MaxFileSizeValidatorOptions = {
  /**
   * 允许的最大文件大小（字节）。
   */
  maxSize: number;

  /**
   * @deprecated 请使用 `errorMessage` 替代。
   */
  message?: string | ((maxSize: number) => string);

  /**
   * 文件大小验证失败时返回的自定义错误消息。
   * 可以提供静态字符串，或作为工厂函数接收验证上下文（文件和验证器配置）
   * 并返回动态错误消息。
   *
   * @example
   * // 静态消息
   * new MaxFileSizeValidator({ maxSize: 1000, errorMessage: 'File size exceeds the limit' })
   *
   * @example
   * // 基于文件对象和验证器配置的动态消息
   * new MaxFileSizeValidator({
   *   maxSize: 1000,
   *   errorMessage: ctx => `Received file size is ${ctx.file?.size}, but it must be smaller than ${ctx.config.maxSize}.`
   * })
   */
  errorMessage?: string | ((ctx: MaxFileSizeValidatorContext) => string);
};

/**
 * 定义内置的最大文件大小验证器。
 *
 * @see [文件验证器](https://docs.nestjs.cn/techniques/file-upload#file-validation)
 *
 * @publicApi
 */
export class MaxFileSizeValidator extends FileValidator<
  MaxFileSizeValidatorOptions,
  IFile
> {
  /**
   * 构建文件大小校验失败时的错误消息：
   * 优先使用自定义 `errorMessage`（或已废弃的 `message`），
   * 否则拼装包含实际文件大小与最大限制的默认消息
   *
   * @param file 请求对象中的文件
   * @returns 校验失败时显示的错误消息
   */
  buildErrorMessage(file?: IFile): string {
    const { errorMessage, message, ...config } = this.validationOptions;

    if (errorMessage) {
      return typeof errorMessage === 'function'
        ? errorMessage({ file, config })
        : errorMessage;
    }

    if (message) {
      return typeof message === 'function'
        ? message(this.validationOptions.maxSize)
        : message;
    }

    if (file?.size) {
      return `Validation failed (current file size is ${file.size}, expected size is less than ${this.validationOptions.maxSize})`;
    }
    return `Validation failed (expected size is less than ${this.validationOptions.maxSize})`;
  }

  /**
   * 校验上传文件大小是否小于 `maxSize` 限制
   *
   * @param file 请求对象中的文件
   * @returns 文件大小有效（或未传文件/未配置选项）则返回 `true`
   */
  public isValid(file?: IFile): boolean {
    if (!this.validationOptions || !file) {
      return true;
    }

    return 'size' in file && file.size < this.validationOptions.maxSize;
  }
}
