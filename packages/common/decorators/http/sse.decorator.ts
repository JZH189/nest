import { METHOD_METADATA, PATH_METADATA, SSE_METADATA } from '../../constants';
import { RequestMethod } from '../../enums/request-method.enum';

/**
 * 将此路由声明为 Server-Sent-Events 端点
 *
 * @publicApi
 */
export function Sse(
  path?: string,
  options: { [METHOD_METADATA]?: RequestMethod } = {
    [METHOD_METADATA]: RequestMethod.GET,
  },
): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    path = path && path.length ? path : '/';

    Reflect.defineMetadata(PATH_METADATA, path, descriptor.value);
    Reflect.defineMetadata(
      METHOD_METADATA,
      options[METHOD_METADATA],
      descriptor.value,
    );
    Reflect.defineMetadata(SSE_METADATA, true, descriptor.value);
    return descriptor;
  };
}
