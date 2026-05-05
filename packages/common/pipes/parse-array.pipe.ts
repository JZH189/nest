import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import { HttpStatus } from '../enums/http-status.enum';
import { Type } from '../interfaces';
import {
  ArgumentMetadata,
  PipeTransform,
} from '../interfaces/features/pipe-transform.interface';
import { HttpErrorByCode } from '../utils/http-error-by-code.util';
import { isNil, isString, isUndefined } from '../utils/shared.utils';
import { ValidationPipe, ValidationPipeOptions } from './validation.pipe';

const VALIDATION_ERROR_MESSAGE = 'Validation failed (parsable array expected)';
const DEFAULT_ARRAY_SEPARATOR = ',';

/**
 * @publicApi
 */
export interface ParseArrayOptions extends Omit<
  ValidationPipeOptions,
  'transform' | 'validateCustomDecorators' | 'exceptionFactory'
> {
  /**
   * 要转换成的项目类型
   */
  items?: Type<unknown>;
  /**
   * 用于分割字符串的项目分隔符
   * @default ','
   */
  separator?: string;
  /**
   * 如果为 true，当未提供值时，管道将返回 null 或 undefined
   * @default false
   */
  optional?: boolean;
  /**
   * 如果验证失败，返回要抛出的异常对象的工厂函数。
   * @param error 错误消息或对象
   * @returns 异常对象
   */
  exceptionFactory?: (error: any) => any;
}

/**
 * 定义内置的 ParseArray 管道
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseArrayPipe implements PipeTransform {
  protected readonly validationPipe: ValidationPipe;
  protected exceptionFactory: (error: string) => any;

  constructor(@Optional() protected readonly options: ParseArrayOptions = {}) {
    this.validationPipe = new ValidationPipe({
      transform: true,
      validateCustomDecorators: true,
      ...options,
    });

    const { exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST } =
      options;
    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));
  }

  /**
   * 访问并对正在处理中的请求参数执行可选转换的方法。
   *
   * @param value 当前正在处理的路由参数
   * @param metadata 包含有关当前正在处理的路由参数的元数据
   */
  async transform(value: any, metadata: ArgumentMetadata): Promise<any> {
    if (!value && !this.options.optional) {
      throw this.exceptionFactory(VALIDATION_ERROR_MESSAGE);
    } else if (isNil(value) && this.options.optional) {
      return value;
    }

    if (!Array.isArray(value)) {
      if (!isString(value)) {
        throw this.exceptionFactory(VALIDATION_ERROR_MESSAGE);
      } else {
        try {
          value = value
            .trim()
            .split(this.options.separator || DEFAULT_ARRAY_SEPARATOR);
        } catch {
          throw this.exceptionFactory(VALIDATION_ERROR_MESSAGE);
        }
      }
    }
    if (this.options.items) {
      const validationMetadata: ArgumentMetadata = {
        metatype: this.options.items,
        type: 'query',
      };

      const isExpectedTypePrimitive = this.isExpectedTypePrimitive();
      const toClassInstance = (item: any, index?: number) => {
        if (this.options.items !== String) {
          try {
            item = JSON.parse(item);
          } catch {
            // Do nothing
          }
        }
        if (isExpectedTypePrimitive) {
          return this.validatePrimitive(item, index);
        }
        return this.validationPipe.transform(item, validationMetadata);
      };
      if (this.options.stopAtFirstError === false) {
        // strict compare to "false" to make sure
        // that this option is disabled by default
        let errors: string[] = [];

        const targetArray = value as Array<unknown>;
        for (let i = 0; i < targetArray.length; i++) {
          try {
            targetArray[i] = await toClassInstance(targetArray[i]);
          } catch (err) {
            let message: string[] | string;
            if (err.getResponse) {
              const response = err.getResponse();
              if (Array.isArray(response.message)) {
                message = response.message.map(
                  (item: string) => `[${i}] ${item}`,
                );
              } else {
                message = `[${i}] ${response.message}`;
              }
            } else {
              message = err;
            }
            errors = errors.concat(message);
          }
        }
        if (errors.length > 0) {
          throw this.exceptionFactory(errors as any);
        }
        return targetArray;
      } else {
        value = await Promise.all(value.map(toClassInstance));
      }
    }
    return value;
  }

  protected isExpectedTypePrimitive(): boolean {
    return [Boolean, Number, String].includes(this.options.items as any);
  }

  protected validatePrimitive(originalValue: any, index?: number) {
    if (this.options.items === Number) {
      const value =
        originalValue !== null && originalValue !== '' ? +originalValue : NaN;
      if (isNaN(value)) {
        throw this.exceptionFactory(
          `${isUndefined(index) ? '' : `[${index}] `}item must be a number`,
        );
      }
      return value;
    } else if (this.options.items === String) {
      if (!isString(originalValue)) {
        return `${originalValue}`;
      }
    } else if (this.options.items === Boolean) {
      if (typeof originalValue !== 'boolean') {
        throw this.exceptionFactory(
          `${
            isUndefined(index) ? '' : `[${index}] `
          }item must be a boolean value`,
        );
      }
    }
    return originalValue;
  }
}
