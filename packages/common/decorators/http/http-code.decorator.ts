import { HTTP_CODE_METADATA } from '../../constants';

/**
 * 请求方法装饰器。定义 HTTP 响应状态码。覆盖装饰的请求方法的默认状态码。
 *
 * @param statusCode 路由处理程序返回的 HTTP 响应码。
 *
 * @see [HTTP 状态码](https://docs.nestjs.cn/controllers#status-code)
 *
 * @publicApi
 */
export function HttpCode(statusCode: number): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    Reflect.defineMetadata(HTTP_CODE_METADATA, statusCode, descriptor.value);
    return descriptor;
  };
}
