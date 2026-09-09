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

/**
 * 事件订阅装饰器：声明该方法为“事件处理器”，订阅匹配指定模式的事件
 * （由客户端 emit() 或其他服务发出的事件触发，不回传响应）。
 * 写入的元数据（由 ListenerMetadataExplorer 读取并注册到服务端）：
 * - PATTERN_METADATA：模式（字符串或对象，可传数组）；
 * - PATTERN_HANDLER_METADATA：处理器类型为 EVENT；
 * - TRANSPORT_METADATA：可选的目标传输层；
 * - PATTERN_EXTRAS_METADATA：额外选项（如 Kafka 的 raw 消息等）。
 *
 * @param metadata - 事件模式
 * @param transport - 指定仅在该传输层注册（可选）
 * @param extras - 额外元数据（可选）
 * @returns 方法装饰器
 *
 * @publicApi
 */
export const EventPattern: {
  <T = string>(metadata?: T): MethodDecorator;
  <T = string>(metadata?: T, transport?: Transport | symbol): MethodDecorator;
  <T = string>(metadata?: T, extras?: Record<string, any>): MethodDecorator;
  <T = string>(
    metadata?: T,
    transport?: Transport | symbol,
    extras?: Record<string, any>,
  ): MethodDecorator;
} = <T = string>(
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
  // 2. 在方法上写入模式、处理器类型（EVENT）、传输层与额外元数据
  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(
      PATTERN_METADATA,
      ([] as any[]).concat(metadata),
      descriptor.value,
    );
    Reflect.defineMetadata(
      PATTERN_HANDLER_METADATA,
      PatternHandler.EVENT,
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
  };
};
