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
 * 解析并校验数组参数的选项
 *
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
 * 属于解析型（Parse）管道：将逗号分隔的字符串（如 `"1,2,3"`）解析为数组，
 * 并可借助内部持有的 ValidationPipe 对每个元素做进一步校验/转换。
 * 校验失败时默认抛出 400 Bad Request 异常。
 * 该管道在路由处理方法被调用之前由框架自动执行。
 *
 * @see [内置管道](https://docs.nestjs.cn/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseArrayPipe implements PipeTransform {
  /**
   * 内部复用的 ValidationPipe 实例，用于对数组元素（类对象类型）执行校验与转换
   */
  protected readonly validationPipe: ValidationPipe;
  /**
   * 校验失败时用于构造待抛出异常的工厂函数
   */
  protected exceptionFactory: (error: string) => any;

  /**
   * 构造函数：初始化内部 ValidationPipe 及异常工厂
   *
   * @param options 解析数组管道的配置项
   */
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
   * 处理流程：
   * 1. 若值为空且未开启 `optional`，抛出校验异常；开启 `optional` 则直接返回空值；
   * 2. 若值不是数组，则按分隔符（默认逗号）将字符串拆分为数组；
   * 3. 若配置了 `items`，对每个元素做解析：原始类型用 `validatePrimitive` 校验，
   *    对象类型则委托给内部 ValidationPipe 转换为类实例并校验；
   * 4. 根据 `stopAtFirstError` 决定是"遇错即停"还是"收集全部错误后统一抛出"。
   *
   * @param value 当前正在处理的路由参数
   * @param metadata 包含有关当前正在处理的路由参数的元数据
   * @returns 解析（并按需校验/转换）后的数组
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

  /**
   * 判断配置的元素类型 `items` 是否为 JavaScript 原始类型构造器（String/Number/Boolean）
   *
   * @returns 如果是原始类型构造器则返回 `true`
   */
  protected isExpectedTypePrimitive(): boolean {
    return [Boolean, Number, String].includes(this.options.items as any);
  }

  /**
   * 校验数组中的单个原始类型元素：
   * - `Number`：尝试转为数字，失败（NaN）则抛出异常；
   * - `String`：非字符串则强制转为字符串；
   * - `Boolean`：非布尔值则抛出异常。
   *
   * @param originalValue 待校验的原始元素值
   * @param index 元素在数组中的下标（用于拼装错误信息，可选）
   * @returns 校验/转换后的元素值
   */
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
