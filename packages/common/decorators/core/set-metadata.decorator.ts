/**
 * 自定义装饰器的返回类型：同时兼容类装饰器与方法装饰器，
 * 并携带 `KEY` 静态属性（即元数据键），方便在守卫/拦截器等
 * 中通过 `Reflector` 读取时引用同一个 key。
 */
export type CustomDecorator<TKey = string> = MethodDecorator &
  ClassDecorator & {
    KEY: TKey;
  };

/**
 * 使用指定的 `key` 向类/函数分配元数据的装饰器。
 *
 * 需要两个参数:
 * - `key` - 定义存储元数据的键的值
 * - `value` - 与 `key` 关联的元数据
 *
 * 此元数据可以使用 `Reflector` 类进行反射。
 *
 * 示例: `@SetMetadata('roles', ['admin'])`
 *
 * @see [反射和元数据](https://docs.nestjs.cn/fundamentals/execution-context#reflection-and-metadata)
 *
 * @publicApi
 */
export const SetMetadata = <K = string, V = any>(
  metadataKey: K,
  metadataValue: V,
): CustomDecorator<K> => {
  const decoratorFactory = (target: object, key?: any, descriptor?: any) => {
    // descriptor 存在说明用在方法上，元数据挂在方法函数上；否则挂在类上
    if (descriptor) {
      Reflect.defineMetadata(metadataKey, metadataValue, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(metadataKey, metadataValue, target);
    return target;
  };
  // 暴露元数据键，使用者可通过 XxxDecorator.KEY 引用，配合 Reflector 读取
  decoratorFactory.KEY = metadataKey;
  return decoratorFactory;
};
