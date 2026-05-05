import { pathToFileURL } from 'url';
import { Logger } from '../../services/logger.service';
import { FileValidatorContext } from './file-validator-context.interface';
import { FileValidator } from './file-validator.interface';
import { IFile } from './interfaces';
import { loadEsm } from 'load-esm';

const logger = new Logger('FileTypeValidator');
type FileTypeValidatorContext = FileValidatorContext<
  Omit<FileTypeValidatorOptions, 'errorMessage'>
>;

export type FileTypeValidatorOptions = {
  /**
   * 用于验证的期望文件类型。可以是字符串（MIME 类型）或正则表达式来匹配多种类型。
   *
   * @example
   * // 匹配单个 MIME 类型
   * fileType: 'image/png'
   *
   * @example
   * // 使用正则表达式匹配多种类型
   * fileType: /^image\/(png|jpeg)$/
   */
  fileType: string | RegExp;

  /**
   * 文件类型验证失败时显示的自定义错误消息。
   * 可以提供静态字符串，或作为工厂函数接收验证上下文（文件和验证器配置）
   * 并返回动态错误消息。
   *
   * @example
   * // 静态消息
   * new FileTypeValidator({ fileType: 'image/png', errorMessage: 'Only PNG allowed' })
   *
   * @example
   * // 基于文件对象和验证器配置的动态消息
   * new FileTypeValidator({
   *   fileType: 'image/png',
   *   errorMessage: ctx => `Received file type '${ctx.file?.mimetype}', but expected '${ctx.config.fileType}'`
   * })
   */
  errorMessage?: string | ((ctx: FileTypeValidatorContext) => string);

  /**
   * 如果为 `true`，验证器将跳过魔数验证。
   * 当某些文件类型没有常见的魔数可用时，这会很有用。
   * @default false
   */
  skipMagicNumbersValidation?: boolean;

  /**
   * 如果为 `true`，且魔数检查失败，则回退到 mimetype 比较。
   * @default false
   */
  fallbackToMimetype?: boolean;
};

/**
 * 定义内置的 FileTypeValidator。它使用 file-type 包检查文件的魔数来验证传入的文件，
 * 提供比仅检查 mimetype 字符串更可靠的文件类型验证。
 *
 * @see [文件验证器](https://docs.nestjs.cn/techniques/file-upload#validators)
 *
 * @publicApi
 */
export class FileTypeValidator extends FileValidator<
  FileTypeValidatorOptions,
  IFile
> {
  buildErrorMessage(file?: IFile): string {
    const { errorMessage, ...config } = this.validationOptions;

    if (errorMessage) {
      return typeof errorMessage === 'function'
        ? errorMessage({ file, config })
        : errorMessage;
    }

    if (file?.mimetype) {
      const baseMessage = `Validation failed (current file type is ${file.mimetype}, expected type is ${this.validationOptions.fileType})`;

      /**
       * 如果启用了 fallbackToMimetype，这意味着验证器无法通过魔数检查检测到文件类型
       *（例如由于缓冲区未知或太短），转而使用客户端提供的 mimetype 字符串作为回退。
       *
       * 此消息说明使用了回退逻辑，以防用户依赖文件签名。
       */
      if (this.validationOptions.fallbackToMimetype) {
        return `${baseMessage} - magic number detection failed, used mimetype fallback`;
      }

      return baseMessage;
    }

    return `Validation failed (expected type is ${this.validationOptions.fileType})`;
  }

  async isValid(file?: IFile): Promise<boolean> {
    if (!this.validationOptions) {
      return true;
    }

    const isFileValid = !!file && 'mimetype' in file;

    // Skip magic number validation if set
    if (this.validationOptions.skipMagicNumbersValidation) {
      return (
        isFileValid && !!file.mimetype.match(this.validationOptions.fileType)
      );
    }

    if (!isFileValid) return false;

    if (!file.buffer) {
      if (this.validationOptions.fallbackToMimetype) {
        return !!file.mimetype.match(this.validationOptions.fileType);
      }
      return false;
    }

    try {
      let fileTypeModule: string;
      try {
        const resolvedPath = require.resolve('file-type');
        fileTypeModule = pathToFileURL(resolvedPath).href;
      } catch {
        fileTypeModule = 'file-type';
      }
      const { fileTypeFromBuffer } =
        await loadEsm<typeof import('file-type')>(fileTypeModule);
      const fileType = await fileTypeFromBuffer(file.buffer);

      if (fileType) {
        // Match detected mime type against allowed type
        return !!fileType.mime.match(this.validationOptions.fileType);
      }

      /**
       * 回退逻辑：如果 file-type 无法检测到魔数（例如文件太小），
       * 可选择回退到 mimetype 字符串以保持兼容性。
       * 这对于纯文本、CSV 或没有可识别签名的文件很有用。
       */
      if (this.validationOptions.fallbackToMimetype) {
        return !!file.mimetype.match(this.validationOptions.fileType);
      }
      return false;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check for common ESM loading issues
      if (
        errorMessage.includes('ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING') ||
        errorMessage.includes('Cannot find module') ||
        errorMessage.includes('ERR_MODULE_NOT_FOUND')
      ) {
        logger.warn(
          `Failed to load the "file-type" package for magic number validation. ` +
            `If you are using Jest, run it with NODE_OPTIONS="--experimental-vm-modules". ` +
            `Error: ${errorMessage}`,
        );
      }

      // Fallback to mimetype if enabled
      if (this.validationOptions.fallbackToMimetype) {
        return !!file.mimetype.match(this.validationOptions.fileType);
      }
      return false;
    }
  }
}
