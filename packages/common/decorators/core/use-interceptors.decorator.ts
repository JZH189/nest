import { INTERCEPTORS_METADATA } from '../../constants';
import { NestInterceptor } from '../../interfaces';
import { extendArrayMetadata } from '../../utils/extend-metadata.util';
import { isFunction } from '../../utils/shared.utils';
import { validateEach } from '../../utils/validate-each.util';

/**
 * 根据其上下文，将拦截器绑定到控制器或方法作用域的装饰器。
 *
 * 当在控制器级别使用 `@UseInterceptors` 时，拦截器将被应用到控制器中的每个处理程序(方法)。
 *
 * 当在单独的处理程序级别使用 `@UseInterceptors` 时，拦截器将只应用于该特定方法。
 *
 * @param interceptors 单个拦截器实例或类，或拦截器实例或类的列表。
 *
 * @see [拦截器](https://docs.nestjs.cn/interceptors)
 *
 * @usageNotes
 * 拦截器也可以使用 `app.useGlobalInterceptors()` 全局设置到所有控制器和路由。
 * [详见此处](https://docs.nestjs.cn/interceptors#binding-interceptors)
 *
 * @publicApi
 */
export function UseInterceptors(
  ...interceptors: (NestInterceptor | Function)[]
): MethodDecorator & ClassDecorator {
  return (
    target: any,
    key?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ) => {
    // 校验每个拦截器：要么是类/可调用对象，要么实现了 intercept 方法
    const isInterceptorValid = <T extends Function | Record<string, any>>(
      interceptor: T,
    ) =>
      interceptor &&
      (isFunction(interceptor) || isFunction(interceptor.intercept));

    // descriptor 存在说明用在方法上（方法级拦截器），否则用在类上（控制器级拦截器）
    if (descriptor) {
      validateEach(
        target.constructor,
        interceptors,
        isInterceptorValid,
        '@UseInterceptors',
        'interceptor',
      );
      // 追加到方法的拦截器元数据数组，请求处理管道在守卫之后按顺序执行
      extendArrayMetadata(
        INTERCEPTORS_METADATA,
        interceptors,
        descriptor.value,
      );
      return descriptor;
    }
    validateEach(
      target,
      interceptors,
      isInterceptorValid,
      '@UseInterceptors',
      'interceptor',
    );
    extendArrayMetadata(INTERCEPTORS_METADATA, interceptors, target);
    return target;
  };
}
