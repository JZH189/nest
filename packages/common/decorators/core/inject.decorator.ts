import {
  PARAMTYPES_METADATA,
  PROPERTY_DEPS_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from '../../constants';
import { ForwardReference, InjectionToken } from '../../interfaces';
import { isUndefined } from '../../utils/shared.utils';

/**
 * 将构造函数参数标记为[依赖注入(DI)](https://docs.nestjs.cn/providers#dependency-injection)目标的装饰器。
 *
 * 任何被注入的提供者必须在被注入类的模块范围内可见(广义上说，是包含它的模块)。
 * 这可以通过以下方式实现:
 *
 * - 在同一模块范围内定义提供者
 * - 从一个模块范围导出提供者，并将其导入到被注入类的模块范围中
 * - 从使用 `@Global()` 装饰器标记为全局的模块中导出提供者
 *
 * #### 注入令牌
 * 可以是*类型*(类名)、*字符串*或*符号*。这取决于关联的提供者是如何定义的。
 * 使用 `@Injectable()` 装饰器定义的提供者使用类名作为令牌。
 * 自定义提供者可能使用字符串或符号作为注入令牌。
 *
 * @param token 要注入的提供者的查找键(分配给构造函数参数)。
 *
 * @see [提供者](https://docs.nestjs.cn/providers)
 * @see [自定义提供者](https://docs.nestjs.cn/fundamentals/custom-providers)
 * @see [注入作用域](https://docs.nestjs.cn/fundamentals/injection-scopes)
 *
 * @publicApi
 */
export function Inject(
  token?: InjectionToken | ForwardReference,
): PropertyDecorator & ParameterDecorator {
  const injectCallHasArguments = arguments.length > 0;

  return (target: object, key: string | symbol | undefined, index?: number) => {
    let type = token || Reflect.getMetadata('design:type', target, key!);
    // Try to infer the token in a constructor-based injection
    if (!type && !injectCallHasArguments) {
      type = Reflect.getMetadata(PARAMTYPES_METADATA, target, key!)?.[index!];
    }

    if (!isUndefined(index)) {
      let dependencies =
        Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, target) || [];

      dependencies = [...dependencies, { index, param: type }];
      Reflect.defineMetadata(SELF_DECLARED_DEPS_METADATA, dependencies, target);
      return;
    }
    let properties =
      Reflect.getMetadata(PROPERTY_DEPS_METADATA, target.constructor) || [];

    properties = [...properties, { key, type }];
    Reflect.defineMetadata(
      PROPERTY_DEPS_METADATA,
      properties,
      target.constructor,
    );
  };
}
