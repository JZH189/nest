import {
  OPTIONAL_DEPS_METADATA,
  OPTIONAL_PROPERTY_DEPS_METADATA,
} from '../../constants';
import { isUndefined } from '../../utils/shared.utils';

/**
 * 用于将注入的依赖标记为可选的参数装饰器。
 *
 * 例如:
 * ```typescript
 * constructor(@Optional() @Inject('HTTP_OPTIONS')private readonly httpClient: T) {}
 * ```
 *
 * @see [可选提供者](https://docs.nestjs.cn/providers#optional-providers)
 *
 * @publicApi
 */
export function Optional(): PropertyDecorator & ParameterDecorator {
  return (target: object, key: string | symbol | undefined, index?: number) => {
    if (!isUndefined(index)) {
      const args = Reflect.getMetadata(OPTIONAL_DEPS_METADATA, target) || [];
      Reflect.defineMetadata(OPTIONAL_DEPS_METADATA, [...args, index], target);
      return;
    }
    const properties =
      Reflect.getMetadata(
        OPTIONAL_PROPERTY_DEPS_METADATA,
        target.constructor,
      ) || [];
    Reflect.defineMetadata(
      OPTIONAL_PROPERTY_DEPS_METADATA,
      [...properties, key],
      target.constructor,
    );
  };
}
