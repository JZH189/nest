import { GUARDS_METADATA } from '../../constants';
import { CanActivate } from '../../interfaces';
import { extendArrayMetadata } from '../../utils/extend-metadata.util';
import { isFunction } from '../../utils/shared.utils';
import { validateEach } from '../../utils/validate-each.util';

/**
 * 根据其上下文，将守卫绑定到控制器或方法作用域的装饰器。
 *
 * 当在控制器级别使用 `@UseGuards` 时，守卫将被应用到控制器中的每个处理程序(方法)。
 *
 * 当在单独的处理程序级别使用 `@UseGuards` 时，守卫将只应用于该特定方法。
 *
 * @param guards 单个守卫实例或类，或守卫实例或类的列表。
 *
 * @see [守卫](https://docs.nestjs.cn/guards)
 *
 * @usageNotes
 * 守卫也可以使用 `app.useGlobalGuards()` 全局设置到所有控制器和路由。
 * [详见此处](https://docs.nestjs.cn/guards#binding-guards)
 *
 * @publicApi
 */
export function UseGuards(
  ...guards: (CanActivate | Function)[]
): MethodDecorator & ClassDecorator {
  return (
    target: any,
    key?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ) => {
    const isGuardValid = <T extends Function | Record<string, any>>(guard: T) =>
      guard && (isFunction(guard) || isFunction(guard.canActivate));

    if (descriptor) {
      validateEach(
        target.constructor,
        guards,
        isGuardValid,
        '@UseGuards',
        'guard',
      );
      extendArrayMetadata(GUARDS_METADATA, guards, descriptor.value);
      return descriptor;
    }
    validateEach(target, guards, isGuardValid, '@UseGuards', 'guard');
    extendArrayMetadata(GUARDS_METADATA, guards, target);
    return target;
  };
}
