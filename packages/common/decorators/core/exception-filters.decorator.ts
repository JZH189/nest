import { EXCEPTION_FILTERS_METADATA } from '../../constants';
import { ExceptionFilter } from '../../index';
import { extendArrayMetadata } from '../../utils/extend-metadata.util';
import { isFunction } from '../../utils/shared.utils';
import { validateEach } from '../../utils/validate-each.util';

/**
 * 根据其上下文，将异常过滤器绑定到控制器或方法作用域的装饰器。
 *
 * 当在控制器级别使用 `@UseFilters` 时，过滤器将被应用到控制器中的每个处理程序(方法)。
 *
 * 当在单独的处理程序级别使用 `@UseFilters` 时，过滤器将只应用于该特定方法。
 *
 * @param filters 异常过滤器实例或类，或异常过滤器实例或类的列表。
 *
 * @see [异常过滤器](https://docs.nestjs.cn/exception-filters)
 *
 * @usageNotes
 * 异常过滤器也可以使用 `app.useGlobalFilters()` 全局设置到所有控制器和路由。
 * [详见此处](https://docs.nestjs.cn/exception-filters#binding-filters)
 *
 * @publicApi
 */

export const UseFilters = (...filters: (ExceptionFilter | Function)[]) =>
  addExceptionFiltersMetadata(...filters);

function addExceptionFiltersMetadata(
  ...filters: (Function | ExceptionFilter)[]
): MethodDecorator & ClassDecorator {
  return (
    target: any,
    key?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ) => {
    const isFilterValid = <T extends Function | Record<string, any>>(
      filter: T,
    ) => filter && (isFunction(filter) || isFunction(filter.catch));

    if (descriptor) {
      validateEach(
        target.constructor,
        filters,
        isFilterValid,
        '@UseFilters',
        'filter',
      );
      extendArrayMetadata(
        EXCEPTION_FILTERS_METADATA,
        filters,
        descriptor.value,
      );
      return descriptor;
    }
    validateEach(target, filters, isFilterValid, '@UseFilters', 'filter');
    extendArrayMetadata(EXCEPTION_FILTERS_METADATA, filters, target);
    return target;
  };
}
