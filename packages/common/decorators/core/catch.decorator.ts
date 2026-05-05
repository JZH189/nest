import { CATCH_WATERMARK, FILTER_CATCH_EXCEPTIONS } from '../../constants';
import { Type, Abstract } from '../../interfaces';

/**
 * 将类标记为 Nest 异常过滤器的装饰器。异常过滤器处理应用程序代码抛出或未处理的异常。
 *
 * 被装饰的类必须实现 `ExceptionFilter` 接口。
 *
 * @param exceptions 一个或多个异常*类型*，指定要由此过滤器捕获和处理的异常。
 *
 * @see [异常过滤器](https://docs.nestjs.cn/exception-filters)
 *
 * @usageNotes
 * 异常过滤器使用 `@UseFilters()` 装饰器应用，或(全局)使用 `app.useGlobalFilters()`。
 *
 * @publicApi
 */
export function Catch(
  ...exceptions: Array<Type<any> | Abstract<any>>
): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(CATCH_WATERMARK, true, target);
    Reflect.defineMetadata(FILTER_CATCH_EXCEPTIONS, exceptions, target);
  };
}
