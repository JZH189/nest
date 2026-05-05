import { REDIRECT_METADATA } from '../../constants';

/**
 * 将请求重定向到指定的 URL。
 *
 * @publicApi
 */
export function Redirect(url = '', statusCode?: number): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    Reflect.defineMetadata(
      REDIRECT_METADATA,
      { statusCode, url },
      descriptor.value,
    );
    return descriptor;
  };
}
