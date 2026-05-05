/**
 * 将*参数装饰器*绑定到后续方法的装饰器。
 *
 * 当语言不提供"参数装饰器"功能时很有用(即普通 JavaScript)。
 *
 * @param decorators 一个或多个参数装饰器(例如 `Req()`)
 *
 * @publicApi
 */
export function Bind(...decorators: any[]): MethodDecorator {
  return <T>(
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ) => {
    decorators.forEach((fn, index) => fn(target, key, index));
    return descriptor;
  };
}
