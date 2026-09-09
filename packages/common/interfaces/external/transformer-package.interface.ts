import { Type } from '../type.interface';
import { ClassTransformOptions } from './class-transform-options.interface';

/**
 * 描述类转换器包（如 class-transformer）所需的最小 API 契约。
 * 使用 ValidationPipe 时，Nest 会通过该接口适配实际加载的转换库，
 * 完成"普通对象 -> 类实例"（plainToInstance）与"类实例 -> 普通对象"（classToPlain）的转换。
 */
export interface TransformerPackage {
  plainToInstance<T>(
    cls: Type<T>,
    plain: unknown,
    options?: ClassTransformOptions,
  ): T | T[];
  classToPlain(
    object: unknown,
    options?: ClassTransformOptions,
  ): Record<string, any> | Record<string, any>[];
}
