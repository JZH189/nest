import { PIPES_METADATA } from '../../constants';
import { PipeTransform } from '../../interfaces/index';
import { extendArrayMetadata } from '../../utils/extend-metadata.util';
import { isFunction } from '../../utils/shared.utils';
import { validateEach } from '../../utils/validate-each.util';

/**
 * 根据其上下文，将管道绑定到控制器或方法作用域的装饰器。
 *
 * 当在控制器级别使用 `@UsePipes` 时，管道将被应用到控制器中的每个处理程序(方法)。
 *
 * 当在单独的处理程序级别使用 `@UsePipes` 时，管道将只应用于该特定方法。
 *
 * @param pipes 单个管道实例或类，或管道实例或类的列表。
 *
 * @see [管道](https://docs.nestjs.cn/pipes)
 *
 * @usageNotes
 * 管道也可以使用 `app.useGlobalPipes()` 全局设置到所有控制器和路由。
 * [详见此处](https://docs.nestjs.cn/pipes#class-validator)
 *
 * @publicApi
 */

export function UsePipes(
  ...pipes: (PipeTransform | Function)[]
): ClassDecorator & MethodDecorator {
  return (
    target: any,
    key?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ) => {
    const isPipeValid = <T extends Function | Record<string, any>>(pipe: T) =>
      pipe && (isFunction(pipe) || isFunction(pipe.transform));

    if (descriptor) {
      extendArrayMetadata(PIPES_METADATA, pipes, descriptor.value);
      return descriptor;
    }
    validateEach(target, pipes, isPipeValid, '@UsePipes', 'pipe');
    extendArrayMetadata(PIPES_METADATA, pipes, target);
    return target;
  };
}
