import {
  isNil,
  isNumber,
  isObject,
  isSymbol,
} from '@nestjs/common/utils/shared.utils';

import {
  PATTERN_EXTRAS_METADATA,
  PATTERN_HANDLER_METADATA,
  PATTERN_METADATA,
  TRANSPORT_METADATA,
} from '../constants';
import { Transport } from '../enums';
import { PatternHandler } from '../enums/pattern-handler.enum';
import {
  InvalidGrpcDecoratorException,
  RpcDecoratorMetadata,
} from '../errors/invalid-grpc-message-decorator.exception';
import { PatternMetadata } from '../interfaces/pattern-metadata.interface';

/**
 * gRPC 流式方法类型：
 * - NO_STREAMING：非流式（一元调用）；
 * - RX_STREAMING：RxJS 风格流式（处理器参数为 Observable）；
 * - PT_STREAMING：直通（pass-through）流式（直接暴露 gRPC call 对象）。
 */
export enum GrpcMethodStreamingType {
  NO_STREAMING = 'no_stream',
  RX_STREAMING = 'rx_stream',
  PT_STREAMING = 'pt_stream',
}

/**
 * 消息订阅装饰器：声明该方法为“消息处理器”，订阅匹配指定模式的消息
 * （由客户端 send() 发出，需要回传响应，即请求-响应式通信）。
 * 写入的元数据（由 ListenerMetadataExplorer 读取并注册到服务端）：
 * - PATTERN_METADATA：模式（字符串或对象，可传数组）；
 * - PATTERN_HANDLER_METADATA：处理器类型为 MESSAGE；
 * - TRANSPORT_METADATA：可选的目标传输层；
 * - PATTERN_EXTRAS_METADATA：额外选项。
 * 元数据写入失败时抛出 InvalidGrpcDecoratorException（常见于错误使用 gRPC 装饰器）。
 *
 * @param metadata - 消息模式
 * @param transport - 指定仅在该传输层注册（可选）
 * @param extras - 额外元数据（可选）
 * @returns 方法装饰器
 *
 * @publicApi
 */
export const MessagePattern: {
  <T = PatternMetadata | string>(metadata?: T): MethodDecorator;
  <T = PatternMetadata | string>(
    metadata?: T,
    transport?: Transport | symbol,
  ): MethodDecorator;
  <T = PatternMetadata | string>(
    metadata?: T,
    extras?: Record<string, any>,
  ): MethodDecorator;
  <T = PatternMetadata | string>(
    metadata?: T,
    transport?: Transport | symbol,
    extras?: Record<string, any>,
  ): MethodDecorator;
} = <T = PatternMetadata | string>(
  metadata?: T,
  transportOrExtras?: Transport | symbol | Record<string, any>,
  maybeExtras?: Record<string, any>,
): MethodDecorator => {
  // 1. 根据第二个参数的类型区分：数字/symbol 视为 transport；对象视为 extras
  let transport: Transport | symbol;
  let extras: Record<string, any>;
  if (
    (isNumber(transportOrExtras) || isSymbol(transportOrExtras)) &&
    isNil(maybeExtras)
  ) {
    transport = transportOrExtras;
  } else if (isObject(transportOrExtras) && isNil(maybeExtras)) {
    extras = transportOrExtras;
  } else {
    transport = transportOrExtras as Transport | symbol;
    extras = maybeExtras!;
  }

  // 2. 在方法上写入模式、处理器类型（MESSAGE）、传输层与额外元数据
  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    try {
      Reflect.defineMetadata(
        PATTERN_METADATA,
        ([] as any[]).concat(metadata),
        descriptor.value,
      );
      Reflect.defineMetadata(
        PATTERN_HANDLER_METADATA,
        PatternHandler.MESSAGE,
        descriptor.value,
      );
      Reflect.defineMetadata(TRANSPORT_METADATA, transport, descriptor.value);
      Reflect.defineMetadata(
        PATTERN_EXTRAS_METADATA,
        {
          ...Reflect.getMetadata(PATTERN_EXTRAS_METADATA, descriptor.value),
          ...extras,
        },
        descriptor.value,
      );
      return descriptor;
    } catch (err) {
      throw new InvalidGrpcDecoratorException(metadata as RpcDecoratorMetadata);
    }
  };
};

/**
 * 注册 gRPC 方法处理器：按 proto 中的服务定义绑定该方法。
 * 内部通过生成 gRPC 模式的 MessagePattern 元数据实现。
 * 服务名/方法名缺省时从控制器类名与方法名推断（方法名首字母大写）。
 * @param service - proto 中的服务名（可选，缺省用类名）
 * @param method - rpc 方法名（可选，缺省用方法名首字母大写）
 * @returns 方法装饰器
 */
export function GrpcMethod(service?: string): MethodDecorator;
export function GrpcMethod(service: string, method?: string): MethodDecorator;
export function GrpcMethod(
  service: string | undefined,
  method?: string,
): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const metadata = createGrpcMethodMetadata(target, key, service, method);
    return MessagePattern(metadata, Transport.GRPC)(target, key, descriptor);
  };
}

/**
 * 注册 RX 风格的 gRPC 流式方法处理器：处理器第一个参数为 Observable，
 * 收到请求流数据，返回值作为响应流发送。
 *
 * @param service - proto 中服务定义名称的字符串
 */
export function GrpcStreamMethod(service?: string): MethodDecorator;
/**
 * @param service - proto 中服务定义名称的字符串
 * @param method - 可选的服务定义中 rpc 关键字后的方法名
 */
export function GrpcStreamMethod(
  service: string,
  method?: string,
): MethodDecorator;
export function GrpcStreamMethod(
  service: string | undefined,
  method?: string,
): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const metadata = createGrpcMethodMetadata(
      target,
      key,
      service,
      method,
      GrpcMethodStreamingType.RX_STREAMING,
    );

    MessagePattern(metadata, Transport.GRPC)(target, key, descriptor);

    const originalMethod = descriptor.value;

    // 覆写原方法：在第一个参数（Observable）上调用 "drainBuffer"，
    // 避免订阅建立前到达的消息被提前发射
    descriptor.value = function (this: any, observable: any, ...args: any[]) {
      const result = originalMethod.apply(this, [observable, ...args]);
      const isPromise = result && typeof result.then === 'function';
      if (isPromise) {
        return result.then((data: any) => {
          if (observable && observable.drainBuffer) {
            observable.drainBuffer();
          }
          return data;
        });
      }

      if (observable && observable.drainBuffer) {
        observable.drainBuffer();
      }
      return result;
    };

    // 把原方法上的所有元数据复制到新方法上
    const metadataKeys = Reflect.getMetadataKeys(originalMethod);
    metadataKeys.forEach(metadataKey => {
      const metadataValue = Reflect.getMetadata(metadataKey, originalMethod);
      Reflect.defineMetadata(metadataKey, metadataValue, descriptor.value);
    });
  };
}

/**
 * 注册“直通（pass-through）”式 gRPC 流式方法处理器：
 * 处理器直接拿到底层 gRPC call 对象，自行读写数据流。
 *
 * @param service - proto 中服务定义名称的字符串
 */
export function GrpcStreamCall(service?: string): MethodDecorator;
/**
 * @param service - proto 中服务定义名称的字符串
 * @param method - 可选的服务定义中 rpc 关键字后的方法名
 */
export function GrpcStreamCall(
  service: string,
  method?: string,
): MethodDecorator;
export function GrpcStreamCall(
  service: string | undefined,
  method?: string,
): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const metadata = createGrpcMethodMetadata(
      target,
      key,
      service,
      method,
      GrpcMethodStreamingType.PT_STREAMING,
    );
    return MessagePattern(metadata, Transport.GRPC)(target, key, descriptor);
  };
}

/**
 * 生成 gRPC 方法装饰器要写入的 MessagePattern 元数据：
 * 按参数组合推断服务名与方法名——
 * 1. 未传 service：服务名取控制器类名，方法名取装饰的方法名（首字母大写）；
 * 2. 只传 service：方法名同样从方法名推断；
 * 3. 同时传 service 与 method：使用显式指定值。
 * @param target - 控制器原型
 * @param key - 装饰的方法名
 * @param service - 服务名（可选）
 * @param method - rpc 方法名（可选）
 * @param streaming - 流式类型，默认 NO_STREAMING
 * @returns 形如 { service, rpc, streaming } 的元数据对象
 */
export function createGrpcMethodMetadata(
  target: object,
  key: string | symbol,
  service: string | undefined,
  method: string | undefined,
  streaming = GrpcMethodStreamingType.NO_STREAMING,
) {
  const capitalizeFirstLetter = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1);

  if (!service) {
    const { name } = target.constructor;
    return {
      service: name,
      rpc: capitalizeFirstLetter(key as string),
      streaming,
    };
  }
  if (service && !method) {
    return { service, rpc: capitalizeFirstLetter(key as string), streaming };
  }
  return { service, rpc: method, streaming };
}
