import { IFile } from './interfaces';

/**
 * 描述 FileValidators 的接口，可以添加到 ParseFilePipe 中。
 *
 * @see {ParseFilePipe}
 * @publicApi
 */
export abstract class FileValidator<
  TValidationOptions = Record<string, any>,
  TFile extends IFile = IFile,
> {
  constructor(protected readonly validationOptions: TValidationOptions) {}

  /**
   * 根据构造函数中传递的选项，指示此文件是否应被视为有效。
   * @param file 请求对象中的文件
   */
  abstract isValid(
    file?: TFile | TFile[] | Record<string, TFile[]>,
  ): boolean | Promise<boolean>;

  /**
   * 在验证失败时构建错误消息。
   * @param file 请求对象中的文件
   */
  abstract buildErrorMessage(file: any): string;
}
