import {
  FileTypeValidator,
  FileTypeValidatorOptions,
} from './file-type.validator';
import { FileValidator } from './file-validator.interface';
import {
  MaxFileSizeValidator,
  MaxFileSizeValidatorOptions,
} from './max-file-size.validator';
import { ParseFileOptions } from './parse-file-options.interface';
import { ParseFilePipe } from './parse-file.pipe';

/**
 * ParseFilePipe 的链式构建器：以流式 API 逐步添加文件校验器，
 * 最终调用 `build()` 生成配置好校验器的 ParseFilePipe 实例。
 *
 * 典型用法：
 * `new ParseFilePipeBuilder().addFileTypeValidator({...}).addMaxSizeValidator({...}).build()`
 *
 * @publicApi
 */
export class ParseFilePipeBuilder {
  /** 累积添加的文件校验器列表 */
  private validators: FileValidator[] = [];

  /**
   * 添加一个最大文件大小校验器
   *
   * @param options MaxFileSizeValidator 的配置项
   * @returns 当前构建器实例（支持链式调用）
   */
  addMaxSizeValidator(options: MaxFileSizeValidatorOptions) {
    return this.addValidator(new MaxFileSizeValidator(options));
  }

  /**
   * 添加一个文件类型（魔数）校验器
   *
   * @param options FileTypeValidator 的配置项
   * @returns 当前构建器实例（支持链式调用）
   */
  addFileTypeValidator(options: FileTypeValidatorOptions) {
    return this.addValidator(new FileTypeValidator(options));
  }

  /**
   * 添加一个自定义文件校验器（实现 FileValidator 抽象类即可）
   *
   * @param validator 文件校验器实例
   * @returns 当前构建器实例（支持链式调用）
   */
  addValidator(validator: FileValidator) {
    this.validators.push(validator);
    return this;
  }

  /**
   * 用累积的校验器构建 ParseFilePipe 实例，并清空构建器内部状态
   *
   * @param additionalOptions 除 `validators` 外的其他 ParseFile 管道选项
   * @returns 配置好校验器的 ParseFilePipe
   */
  build(
    additionalOptions?: Omit<ParseFileOptions, 'validators'>,
  ): ParseFilePipe {
    const parseFilePipe = new ParseFilePipe({
      ...additionalOptions,
      validators: this.validators,
    });

    this.validators = [];
    return parseFilePipe;
  }
}
