import { ValidationError } from './validation-error.interface';
import { ValidatorOptions } from './validator-options.interface';

/**
 * 描述验证器包（如 class-validator）所需的最小 API 契约。
 * 使用 ValidationPipe 时，Nest 会通过该接口适配实际加载的验证库，对被装饰器标记的参数执行校验。
 */
export interface ValidatorPackage {
  validate(
    object: unknown,
    validatorOptions?: ValidatorOptions,
  ): ValidationError[] | Promise<ValidationError[]>;
}
