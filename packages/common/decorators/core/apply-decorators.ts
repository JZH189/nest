/**
 * 返回一个新装饰器的函数，该装饰器应用通过参数提供的所有装饰器
 *
 * 用于构建新的装饰器(或装饰器工厂)，封装与同一功能相关的多个装饰器
 *
 * @param decorators 一个或多个装饰器(例如 `ApplyGuard(...)`)
 *
 * @publicApi
 */
export function applyDecorators(
  ...decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator>
) {
  return <TFunction extends Function, Y>(
    target: TFunction | object,
    propertyKey?: string | symbol,
    descriptor?: TypedPropertyDescriptor<Y>,
  ) => {
    for (const decorator of decorators) {
      if (target instanceof Function && !descriptor) {
        (decorator as ClassDecorator)(target);
        continue;
      }
      (decorator as MethodDecorator | PropertyDecorator)(
        target,
        propertyKey!,
        descriptor!,
      );
    }
  };
}
