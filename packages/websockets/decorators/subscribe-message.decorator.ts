import { MESSAGE_MAPPING_METADATA, MESSAGE_METADATA } from '../constants';

/**
 * 方法装饰器：订阅满足指定模式（消息名）的消息。
 *
 * 处理步骤（在被装饰的方法回调上写入两个元数据）：
 * 1. 写入 MESSAGE_MAPPING_METADATA，标记该方法是一个消息映射（GatewayMetadataExplorer
 *    探测的依据）；
 * 2. 写入 MESSAGE_METADATA，保存订阅的消息名（WebSocketsController 匹配消息时使用）。
 *
 * @param message - 要订阅的消息模式（如 'events'）。
 * @returns 方法装饰器。
 *
 * @publicApi
 */
export const SubscribeMessage = <T = string>(message: T): MethodDecorator => {
  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(MESSAGE_MAPPING_METADATA, true, descriptor.value);
    Reflect.defineMetadata(MESSAGE_METADATA, message, descriptor.value);
    return descriptor;
  };
};
