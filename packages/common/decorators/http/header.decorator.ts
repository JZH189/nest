import { HEADERS_METADATA } from '../../constants';
import { extendArrayMetadata } from '../../utils/extend-metadata.util';

/**
 * 请求方法装饰器。设置响应头。
 *
 * 例如:
 * `@Header('Cache-Control', 'none')`
 * `@Header('Cache-Control', () => 'none')`
 *
 * @param name 用作响应头名称的字符串
 * @param value 用作响应头值的字符串
 *
 * @see [响应头](https://docs.nestjs.cn/controllers#headers)
 *
 * @publicApi
 */
export function Header(
  name: string,
  value: string | (() => string),
): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    extendArrayMetadata(HEADERS_METADATA, [{ name, value }], descriptor.value);
    return descriptor;
  };
}
