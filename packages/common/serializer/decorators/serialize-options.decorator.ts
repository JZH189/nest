import { SetMetadata } from '../../decorators';
import { ClassSerializerContextOptions } from '../class-serializer.interfaces';
import { CLASS_SERIALIZER_OPTIONS } from '../class-serializer.constants';

/**
 * 为路由处理器方法或控制器类设置 ClassSerializerInterceptor 的序列化选项。
 * 拦截器运行时会通过 Reflector 读取该元数据（方法上的配置优先于类上的配置），
 * 并将其传递给 class-transformer，从而影响 @Exclude/@Expose 等的序列化行为。
 *
 * @param options 序列化选项（透传给 class-transformer，可含 `type`）
 * @returns 参数装饰器（基于 SetMetadata 实现）
 *
 * @publicApi
 */
export const SerializeOptions = (options: ClassSerializerContextOptions) =>
  SetMetadata(CLASS_SERIALIZER_OPTIONS, options);
