import { CLIENT_CONFIGURATION_METADATA, CLIENT_METADATA } from '../constants';
import { ClientOptions } from '../interfaces/client-metadata.interface';

/**
 * 客户端注入装饰器：把 `ClientProxy` 实例注入到被装饰的属性上。
 * 写入的元数据：
 * - CLIENT_METADATA：标记该属性为客户端实例属性；
 * - CLIENT_CONFIGURATION_METADATA：保存客户端配置。
 * 初始化阶段由 ListenersController.assignClientsToProperties 读取这些元数据，
 * 并通过 ClientProxyFactory 创建实例赋值到属性上。
 *
 * @param metadata - 可选的客户端配置（transport + options，或自定义 customClass）
 * @returns 属性装饰器
 *
 * @publicApi
 */
export function Client(metadata?: ClientOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    Reflect.set(target, propertyKey, null);
    Reflect.defineMetadata(CLIENT_METADATA, true, target, propertyKey);
    Reflect.defineMetadata(
      CLIENT_CONFIGURATION_METADATA,
      metadata,
      target,
      propertyKey,
    );
  };
}
