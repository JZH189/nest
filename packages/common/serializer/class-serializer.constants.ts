/**
 * ClassSerializerInterceptor 用来读取序列化选项的元数据键。
 * 通过 @SerializeOptions() 装饰器设置在路由处理器/控制器类上的
 * 序列化配置会存储在该键下，拦截器运行时再用 Reflector 读取。
 */
export const CLASS_SERIALIZER_OPTIONS = 'class_serializer:options';
