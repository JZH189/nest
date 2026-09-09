import { Injectable, Optional } from '../../decorators/core';
import { HttpStatus } from '../../enums';
import { PipeTransform } from '../../interfaces/features/pipe-transform.interface';
import { HttpErrorByCode } from '../../utils/http-error-by-code.util';
import { isEmpty, isObject, isUndefined } from '../../utils/shared.utils';
import { FileValidator } from './file-validator.interface';
import { ParseFileOptions } from './parse-file-options.interface';

/**
 * 定义内置的 ParseFile 管道。此管道可用于使用 `@UploadedFile()` 装饰器验证传入文件。
 * 你可以使用其他特定的内置验证器，或者提供自己的验证器，只需通过 FileValidator 接口实现它，
 * 并将其添加到 ParseFilePipe 的构造函数中即可。
 *
 * 属于校验型管道（不转换文件内容）：在路由处理方法被调用之前由框架自动执行，
 * 依次运行所有注册的 FileValidator，任一校验失败即抛出 HTTP 异常。
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseFilePipe implements PipeTransform<any> {
  /**
   * 校验失败时用于构造待抛出异常的工厂函数
   */
  protected exceptionFactory: (error: string) => any;
  /**
   * 注册到本管道的文件校验器列表
   */
  private readonly validators: FileValidator[];
  /**
   * 文件参数是否为必需（默认 `true`）
   */
  private readonly fileIsRequired: boolean;

  /**
   * 构造函数：初始化异常工厂、校验器列表与文件必需性配置
   *
   * @param options ParseFile 管道的配置项
   */
  constructor(@Optional() options: ParseFileOptions = {}) {
    const {
      exceptionFactory,
      errorHttpStatusCode = HttpStatus.BAD_REQUEST,
      validators = [],
      fileIsRequired,
    } = options;

    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));

    this.validators = validators;
    this.fileIsRequired = fileIsRequired ?? true;
  }

  /**
   * 管道核心方法：检查文件是否存在（结合 `fileIsRequired`），
   * 并依次执行所有校验器。在路由处理方法被调用之前由框架自动执行。
   *
   * @param value 当前正在处理的文件参数（单文件、文件数组或字段对象）
   * @returns 原样返回文件值（本管道只做校验，不做转换）
   * @throws 文件缺失或校验失败时抛出由 `exceptionFactory` 构造的 HTTP 异常
   */
  async transform(value: any): Promise<any> {
    const areThereAnyFilesIn = this.thereAreNoFilesIn(value);

    if (areThereAnyFilesIn && this.fileIsRequired) {
      throw this.exceptionFactory('File is required');
    }
    if (!areThereAnyFilesIn && this.validators.length) {
      await this.validateFilesOrFile(value);
    }

    return value;
  }

  /**
   * 对单个文件或文件数组执行校验（数组时并行校验每个文件）
   *
   * @param value 文件、文件数组或按字段名分组的文件对象
   */
  private async validateFilesOrFile(value: any): Promise<void> {
    if (Array.isArray(value)) {
      await Promise.all(value.map(f => this.validate(f)));
    } else {
      await this.validate(value);
    }
  }

  /**
   * 判断传入值中是否不含任何文件
   * （值为 `undefined`、空数组或空对象时视为"没有文件"）
   *
   * @param value 当前正在处理的文件参数
   * @returns 如果不含任何文件则返回 `true`
   */
  private thereAreNoFilesIn(value: any): boolean {
    const isEmptyArray = Array.isArray(value) && isEmpty(value);
    const isEmptyObject = isObject(value) && isEmpty(Object.keys(value));
    return isUndefined(value) || isEmptyArray || isEmptyObject;
  }

  /**
   * 依次运行所有注册的校验器，任一失败立即抛出异常
   *
   * @param file 待校验的文件
   * @returns 校验通过后的原文件
   */
  protected async validate(file: any): Promise<any> {
    for (const validator of this.validators) {
      await this.validateOrThrow(file, validator);
    }
    return file;
  }

  /**
   * 执行单个校验器：先调用 `isValid`，失败时用 `buildErrorMessage`
   * 构建错误消息并抛出异常
   *
   * @param file 待校验的文件
   * @param validator 文件校验器实例
   */
  private async validateOrThrow(file: any, validator: FileValidator) {
    const isValid = await validator.isValid(file);

    if (!isValid) {
      const errorMessage = validator.buildErrorMessage(file);
      throw this.exceptionFactory(errorMessage);
    }
  }

  /**
   * @returns 此管道使用的验证器列表。
   */
  getValidators() {
    return this.validators;
  }
}
