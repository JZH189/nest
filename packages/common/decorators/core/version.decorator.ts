import { VERSION_METADATA } from '../../constants';
import { VersionValue } from '../../interfaces/version-options.interface';

/**
 * 将端点的版本设置为传入的版本
 *
 * @publicApi
 */
export function Version(version: VersionValue): MethodDecorator {
  if (Array.isArray(version)) {
    // Drop duplicated versions
    version = Array.from(new Set(version));
  }

  return (
    target: any,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    Reflect.defineMetadata(VERSION_METADATA, version, descriptor.value);
    return descriptor;
  };
}
