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
    if (descriptor) {
      Reflect.defineMetadata(metadataKey, metadataValue, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(metadataKey, metadataValue, target);
    return target;
  };
  decoratorFactory.KEY = metadataKey;
  return decoratorFactory;
};
