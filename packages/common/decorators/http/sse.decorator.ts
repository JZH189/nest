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
    // 默认路径为根路径 '/'
    path = path && path.length ? path : '/';

    // 写入路由路径与请求方法（默认 GET），与普通路由相同的方式注册
    Reflect.defineMetadata(PATH_METADATA, path, descriptor.value);
    Reflect.defineMetadata(
      METHOD_METADATA,
      options[METHOD_METADATA],
      descriptor.value,
    );
    // SSE_METADATA：标记该路由为 Server-Sent-Events 端点，
    // SSE 响应处理时会据此切换为事件流响应
    Reflect.defineMetadata(SSE_METADATA, true, descriptor.value);
    return descriptor;
  };
}
