import { iterate } from 'iterare';
import { types } from 'util';
import { Optional } from '../decorators';
import { Injectable } from '../decorators/core';
import { HttpStatus } from '../enums/http-status.enum';
import { ClassTransformOptions } from '../interfaces/external/class-transform-options.interface';
import { TransformerPackage } from '../interfaces/external/transformer-package.interface';
import { ValidationError } from '../interfaces/external/validation-error.interface';
import { ValidatorOptions } from '../interfaces/external/validator-options.interface';
import { ValidatorPackage } from '../interfaces/external/validator-package.interface';
import {
  ArgumentMetadata,
  PipeTransform,
} from '../interfaces/features/pipe-transform.interface';
import { Type } from '../interfaces/type.interface';
import {
  ErrorHttpStatusCode,
  HttpErrorByCode,
} from '../utils/http-error-by-code.util';
import { loadPackage } from '../utils/load-package.util';
import { isNil, isUndefined } from '../utils/shared.utils';

/**
 * ValidationPipe 的配置选项
 *
 * @publicApi
 */
export interface ValidationPipeOptions extends ValidatorOptions {
  /**
   * 是否将载荷（payload）转换为 DTO 类的实例
   */
  transform?: boolean;
  /**
   * 是否禁用详细的错误信息（开启后异常响应不携带具体校验错误）
   */
  disableErrorMessages?: boolean;
  /**
   * 传递给 class-transformer 的转换选项
   */
  transformOptions?: ClassTransformOptions;
  /**
   * 校验失败时在响应中使用的 HTTP 状态码（默认 400 Bad Request）
   */
  errorHttpStatusCode?: ErrorHttpStatusCode;
  /**
   * 校验失败时返回要抛出的异常对象的工厂函数
   */
  exceptionFactory?: (errors: ValidationError[]) => any;
  /**
   * 是否对自定义装饰器（type === 'custom'）的参数也执行校验
   */
  validateCustomDecorators?: boolean;
  /**
   * 期望参数被转换成的目标类型（覆盖元数据中的 metatype）
   */
  expectedType?: Type<any>;
  /**
   * 显式指定校验器包（默认动态加载 class-validator）
   */
  validatorPackage?: ValidatorPackage;
  /**
   * 显式指定转换器包（默认动态加载 class-transformer）
   */
  transformerPackage?: TransformerPackage;
}

/**
 * 校验器包（class-validator）的模块级引用，
 * 在 ValidationPipe 构造时通过 loadPackage 动态加载
 */
let classValidator: ValidatorPackage = {} as any;
/**
 * 转换器包（class-transformer）的模块级引用，
 * 在 ValidationPipe 构造时通过 loadPackage 动态加载
 */
let classTransformer: TransformerPackage = {} as any;

/**
 * 应该从原型剥离中排除的内置 JavaScript 类型，
 * 以避免与 Jest 的 useFakeTimers 等测试框架冲突
 */
const BUILT_IN_TYPES = [Date, RegExp, Error, Map, Set, WeakMap, WeakSet];

/**
 * 定义内置的 ValidationPipe（验证管道）
 *
 * 属于校验型管道，是 NestJS 中最复杂、功能最强的内置管道：
 * 基于 class-validator 对传入的载荷（DTO）执行基于装饰器的校验，
 * 并可借助 class-transformer 将普通对象转换为 DTO 类实例（`transform: true`）。
 * 校验失败时默认抛出 400 Bad Request 异常（可自定义状态码与异常工厂）。
 *
 * 在请求处理流程中，该管道在路由处理方法（控制器方法）被调用之前、
 * 由路由处理器的参数解析阶段（RouterProxy/handler 参数绑定）自动执行。
 *
 * @see [验证](https://docs.nestjs.cn/techniques/validation)
 *
 * @publicApi
 */
@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  /**
   * 是否启用载荷到 DTO 类实例的自动转换（对应 `transform` 选项）
   */
  protected isTransformEnabled: boolean;
  /**
   * 是否禁用了详细错误信息输出（对应 `disableErrorMessages` 选项）
   */
  protected isDetailedOutputDisabled?: boolean;
  /**
   * 透传给 class-validator 的校验选项
   */
  protected validatorOptions: ValidatorOptions;
  /**
   * 透传给 class-transformer 的转换选项
   */
  protected transformOptions: ClassTransformOptions | undefined;
  /**
   * 校验失败时使用的 HTTP 状态码（默认 400）
   */
  protected errorHttpStatusCode: ErrorHttpStatusCode;
  /**
   * 期望参数被转换成的目标类型（对应 `expectedType` 选项）
   */
  protected expectedType: Type<any> | undefined;
  /**
   * 校验失败时用于构造待抛出异常的工厂函数
   */
  protected exceptionFactory: (errors: ValidationError[]) => any;
  /**
   * 是否对自定义装饰器的参数也执行校验
   */
  protected validateCustomDecorators: boolean;

  /**
   * 构造函数：解析配置项、初始化异常工厂，并动态加载
   * class-validator / class-transformer 两个 peer 依赖包
   *
   * @param options 验证管道的配置项
   */
  constructor(@Optional() options?: ValidationPipeOptions) {
    options = options || {};
    const {
      transform,
      disableErrorMessages,
      errorHttpStatusCode,
      expectedType,
      transformOptions,
      validateCustomDecorators,
      ...validatorOptions
    } = options;

    // @see [https://github.com/nestjs/nest/issues/10683#issuecomment-1413690508](https://github.com/nestjs/nest/issues/10683#issuecomment-1413690508)
    this.validatorOptions = { forbidUnknownValues: false, ...validatorOptions };

    this.isTransformEnabled = !!transform;
    this.transformOptions = transformOptions;
    this.isDetailedOutputDisabled = disableErrorMessages;
    this.validateCustomDecorators = validateCustomDecorators || false;
    this.errorHttpStatusCode = errorHttpStatusCode || HttpStatus.BAD_REQUEST;
    this.expectedType = expectedType;
    this.exceptionFactory =
      options.exceptionFactory || this.createExceptionFactory();

    classValidator = this.loadValidator(options.validatorPackage);
    classTransformer = this.loadTransformer(options.transformerPackage);
  }

  /**
   * 加载校验器包 class-validator（可由 `validatorPackage` 选项显式指定）
   *
   * @param validatorPackage 外部显式传入的校验器包
   * @returns 解析后的校验器包
   */
  protected loadValidator(
    validatorPackage?: ValidatorPackage,
  ): ValidatorPackage {
    return (
      validatorPackage ??
      loadPackage('class-validator', 'ValidationPipe', () =>
        require('class-validator'),
      )
    );
  }

  /**
   * 加载转换器包 class-transformer（可由 `transformerPackage` 选项显式指定）
   *
   * @param transformerPackage 外部显式传入的转换器包
   * @returns 解析后的转换器包
   */
  protected loadTransformer(
    transformerPackage?: TransformerPackage,
  ): TransformerPackage {
    return (
      transformerPackage ??
      loadPackage('class-transformer', 'ValidationPipe', () =>
        require('class-transformer'),
      )
    );
  }

  /**
   * 管道核心方法：对路由参数/请求体执行基于 class-validator 的校验，
   * 并可选地转换为 DTO 类实例。在路由处理方法被调用之前由框架自动执行。
   *
   * 处理流程：
   * 1. 若配置了 `expectedType`，用其覆盖元数据中的 metatype；
   * 2. 若 metatype 不需要校验（内置原始类型等），按需做原始值转换后直接返回；
   * 3. 将 `null`/`undefined` 载荷规整为空对象，并剥离危险的原型污染键；
   * 4. 用 class-transformer 把普通对象转换为 metatype 的类实例；
   * 5. 用 class-validator 对实例执行校验，若有错误则通过异常工厂抛出异常；
   * 6. 根据配置决定返回类实例（transform）、还原原始值（isNil/isPrimitive），
   *    或将实例重新转回普通对象（classToPlain）。
   *
   * @param value 当前正在处理的路由参数或请求体
   * @param metadata 包含有关当前正在处理的路由参数的元数据（类型、metatype 等）
   * @returns 校验（并按需转换）后的值
   * @throws 校验失败时抛出由 `exceptionFactory` 构造的 HTTP 异常
   */
  public async transform(value: any, metadata: ArgumentMetadata) {
    // 1. 若配置了 expectedType，则用期望类型覆盖元数据中的 metatype
    if (this.expectedType) {
      metadata = { ...metadata, metatype: this.expectedType };
    }

    // 2. 若没有 metatype 或该参数不需要校验（内置原始类型等），
    //    开启 transform 时做原始值转换，否则原样返回
    const metatype = metadata.metatype;
    if (!metatype || !this.toValidate(metadata)) {
      return this.isTransformEnabled
        ? this.transformPrimitive(value, metadata)
        : value;
    }
    const originalValue = value;
    // 3. 将 null/undefined 载荷规整为空对象（或空字符串），便于后续校验
    value = this.toEmptyIfNil(value, metatype);

    const isNil = value !== originalValue;
    const isPrimitive = this.isPrimitive(value);
    // 3.1 剥离 __proto__/prototype/constructor 等原型污染危险键
    this.stripProtoKeys(value);
    // 4. 用 class-transformer 将普通对象转换为 metatype 的类实例
    let entity = classTransformer.plainToInstance(
      metatype,
      value,
      this.transformOptions,
    );

    const originalEntity = entity;
    const isCtorNotEqual = entity.constructor !== metatype;

    // 4.1 修正实例的 constructor 引用，确保 class-validator 能
    //     基于 metatype 上的装饰器元数据进行校验
    if (isCtorNotEqual && !isPrimitive) {
      entity.constructor = metatype;
    } else if (isCtorNotEqual) {
      // when "entity" is a primitive value, we have to temporarily
      // replace the entity to perform the validation against the original
      // metatype defined inside the handler
      entity = { constructor: metatype };
    }

    // 5. 执行校验，若存在校验错误则通过异常工厂抛出 HTTP 异常
    const errors = await this.validate(entity, this.validatorOptions);
    if (errors.length > 0) {
      throw await this.exceptionFactory(errors);
    }

    // 6. 返回结果：根据 transform/isNil/isPrimitive 等配置决定返回形态
    if (originalValue === undefined && originalEntity === '') {
      // Since SWC requires empty string for validation (to avoid an error),
      // a fallback is needed to revert to the original value (when undefined).
      // @see [https://github.com/nestjs/nest/issues/14430](https://github.com/nestjs/nest/issues/14430)
      return originalValue;
    }
    if (isPrimitive) {
      // if the value is a primitive value and the validation process has been successfully completed
      // we have to revert the original value passed through the pipe
      entity = originalEntity;
    }
    if (this.isTransformEnabled) {
      return entity;
    }
    if (isNil) {
      // if the value was originally undefined or null, revert it back
      return originalValue;
    }

    // we check if the number of keys of the "validatorOptions" is higher than 1 (instead of 0)
    // because the "forbidUnknownValues" now fallbacks to "false" (in case it wasn't explicitly specified)
    const shouldTransformToPlain =
      Object.keys(this.validatorOptions).length > 1;
    return shouldTransformToPlain
      ? classTransformer.classToPlain(entity, this.transformOptions)
      : value;
  }

  /**
   * 创建默认的异常工厂：把校验错误扁平化为字符串数组，
   * 并按 `errorHttpStatusCode` 构造对应的 HTTP 异常
   *
   * @returns 异常工厂函数，接收校验错误数组并返回待抛出的异常对象
   */
  public createExceptionFactory() {
    return (validationErrors: ValidationError[] = []) => {
      if (this.isDetailedOutputDisabled) {
        return new HttpErrorByCode[this.errorHttpStatusCode]();
      }
      const errors = this.flattenValidationErrors(validationErrors);
      return new HttpErrorByCode[this.errorHttpStatusCode](errors);
    };
  }

  /**
   * 判断给定参数元数据是否需要执行校验：
   * - 自定义装饰器（type === 'custom'）默认跳过，除非开启 `validateCustomDecorators`；
   * - String/Boolean/Number/Array/Object/Buffer/Date 等内置类型跳过。
   *
   * @param metadata 包含有关当前正在处理的路由参数的元数据
   * @returns 如果需要校验则返回 `true`
   */
  protected toValidate(metadata: ArgumentMetadata): boolean {
    const { metatype, type } = metadata;
    if (type === 'custom' && !this.validateCustomDecorators) {
      return false;
    }
    const types = [String, Boolean, Number, Array, Object, Buffer, Date];
    return !types.some(t => metatype === t) && !isNil(metatype);
  }

  /**
   * 对 `@Param()`/`@Query()` 中的原始类型参数执行基础转换
   * （仅在开启 `transform` 且参数无需类校验时被调用）：
   * - `Boolean`：除 `undefined` 外的假值统一转为 `false`，`'true'`/`true` 转为 `true`；
   * - `Number`：转换为数字；`String`：转换为字符串。
   *
   * @param value 当前正在处理的路由参数
   * @param metadata 包含有关当前正在处理的路由参数的元数据
   * @returns 转换后的原始值（不满足转换条件时原样返回）
   */
  protected transformPrimitive(value: any, metadata: ArgumentMetadata) {
    if (!metadata.data) {
      // leave top-level query/param objects unmodified
      return value;
    }
    const { type, metatype } = metadata;
    if (type !== 'param' && type !== 'query') {
      return value;
    }
    if (metatype === Boolean) {
      if (isUndefined(value)) {
        // This is an workaround to deal with optional boolean values since
        // optional booleans shouldn't be parsed to a valid boolean when
        // they were not defined
        return undefined;
      }
      // Any fasly value but `undefined` will be parsed to `false`
      return value === true || value === 'true';
    }
    if (metatype === Number) {
      if (isUndefined(value)) {
        // This is a workaround to deal with optional numeric values since
        // optional numerics shouldn't be parsed to a valid number when
        // they were not defined
        return undefined;
      }
      return +value;
    }
    if (metatype === String && !isUndefined(value)) {
      return String(value);
    }
    return value;
  }

  /**
   * 将 `null`/`undefined` 的载荷规整为便于校验的空值：
   * - metatype 是类（函数/有 prototype）时返回空对象 `{}`；
   * - 否则（如枚举等普通对象类型）返回空字符串（SWC 编译下的兼容处理）。
   *
   * @param value 当前正在处理的载荷
   * @param metatype 参数的目标类型
   * @returns 规整后的空值，或原值（当其不为 `null`/`undefined` 时）
   */
  protected toEmptyIfNil<T = any, R = T>(
    value: T,
    metatype: Type<unknown> | object,
  ): R | object | string {
    if (!isNil(value)) {
      return value as any as R;
    }
    if (
      typeof metatype === 'function' ||
      (metatype && 'prototype' in metatype && metatype.prototype?.constructor)
    ) {
      return {} as object;
    }
    // SWC requires empty string to be returned instead of an empty object
    // when the value is nil and the metatype is not a class instance, but a plain object (enum, for example).
    // Otherwise, the error will be thrown.
    // @see [https://github.com/nestjs/nest/issues/12680](https://github.com/nestjs/nest/issues/12680)
    return '';
  }

  /**
   * 递归删除载荷中可能导致原型污染（prototype pollution）的危险键：
   * `__proto__`、`prototype`、`constructor`（内置类型除外）。
   *
   * @param value 当前正在处理的载荷（对象或数组，递归处理）
   */
  protected stripProtoKeys(value: any) {
    if (
      value == null ||
      typeof value !== 'object' ||
      types.isTypedArray(value)
    ) {
      return;
    }

    // Skip built-in JavaScript primitives to avoid Jest useFakeTimers conflicts
    if (BUILT_IN_TYPES.some(type => value instanceof type)) {
      return;
    }

    if (Array.isArray(value)) {
      for (const v of value) {
        this.stripProtoKeys(v);
      }
      return;
    }

    // Delete dangerous prototype pollution keys
    delete value.__proto__;
    delete value.prototype;

    // Only delete constructor if it's NOT a built-in type
    const constructorType = value?.constructor;
    if (constructorType && !BUILT_IN_TYPES.includes(constructorType)) {
      delete value.constructor;
    }

    for (const key in value) {
      this.stripProtoKeys(value[key]);
    }
  }

  /**
   * 判断给定值是否为 JavaScript 原始类型（number/boolean/string）
   *
   * @param value 待判断的值
   * @returns 如果是原始类型则返回 `true`
   */
  protected isPrimitive(value: unknown): boolean {
    return ['number', 'boolean', 'string'].includes(typeof value);
  }

  /**
   * 委托 class-validator 对对象执行基于装饰器的校验
   * （子类可重写此方法以定制校验行为）
   *
   * @param object 待校验的对象（通常为 DTO 类实例）
   * @param validatorOptions 透传给 class-validator 的校验选项
   * @returns 校验错误数组（无错误时为空数组）
   */
  protected validate(
    object: object,
    validatorOptions?: ValidatorOptions,
  ): Promise<ValidationError[]> | ValidationError[] {
    return classValidator.validate(object, validatorOptions);
  }

  /**
   * 将嵌套的校验错误树扁平化为字符串数组
   * （借助 iterare 库对错误集合做惰性 map/flatten 操作）
   *
   * @param validationErrors class-validator 返回的校验错误数组
   * @returns 扁平化后的错误消息字符串数组
   */
  protected flattenValidationErrors(
    validationErrors: ValidationError[],
  ): string[] {
    return iterate(validationErrors)
      .map(error => this.mapChildrenToValidationErrors(error))
      .flatten()
      .filter(item => !!item.constraints)
      .map(item => Object.values(item.constraints!))
      .flatten()
      .toArray();
  }

  /**
   * 递归展开嵌套的子校验错误（嵌套 DTO），为每条子错误
   * 前缀其父属性路径（如 `parent.child`），便于在错误消息中定位
   *
   * @param error 当前处理的校验错误节点
   * @param parentPath 父属性路径（递归时使用）
   * @returns 展开后的校验错误数组
   */
  protected mapChildrenToValidationErrors(
    error: ValidationError,
    parentPath?: string,
  ): ValidationError[] {
    if (!(error.children && error.children.length)) {
      return [error];
    }
    const validationErrors: ValidationError[] = [];
    parentPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    for (const item of error.children) {
      if (item.children && item.children.length) {
        validationErrors.push(
          ...this.mapChildrenToValidationErrors(item, parentPath),
        );
      }
      validationErrors.push(
        this.prependConstraintsWithParentProp(parentPath, item),
      );
    }
    return validationErrors;
  }

  /**
   * 为子错误的约束消息前缀父属性路径，
   * 例如把 `must be a string` 变为 `parent.child must be a string`
   *
   * @param parentPath 父属性路径
   * @param error 子校验错误
   * @returns 带父路径前缀的新校验错误对象
   */
  protected prependConstraintsWithParentProp(
    parentPath: string,
    error: ValidationError,
  ): ValidationError {
    const constraints = {};
    for (const key in error.constraints) {
      constraints[key] = `${parentPath}.${error.constraints[key]}`;
    }
    return {
      ...error,
      constraints,
    };
  }
}
