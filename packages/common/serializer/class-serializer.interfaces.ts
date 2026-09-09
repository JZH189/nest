import { ClassTransformOptions } from '../interfaces/external/class-transform-options.interface';
import { Type } from '../interfaces';

/**
 * ClassSerializerInterceptor 的上下文序列化选项：
 * 在 class-transformer 选项基础上扩展 `type`，
 * 用于把非类实例的响应对象先转换为指定类的实例再序列化
 *
 * @publicApi
 */
export interface ClassSerializerContextOptions extends ClassTransformOptions {
  /** 期望响应被序列化为的类类型 */
  type?: Type<any>;
}
