import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { isFunction, isUndefined } from '@nestjs/common/utils/shared.utils';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import {
  CLIENT_CONFIGURATION_METADATA,
  CLIENT_METADATA,
  PATTERN_EXTRAS_METADATA,
  PATTERN_HANDLER_METADATA,
  PATTERN_METADATA,
  TRANSPORT_METADATA,
} from './constants';
import { Transport } from './enums';
import { PatternHandler } from './enums/pattern-handler.enum';
import { ClientOptions, PatternMetadata } from './interfaces';

/**
 * 描述某个实例上由 @Client 装饰的属性：属性名及其客户端配置。
 */
export interface ClientProperties {
  /** 被装饰的属性名 */
  property: string;
  /** @Client 传入的客户端配置（transport、options 等） */
  metadata: ClientOptions;
}

/**
 * 描述一个消息/事件监听器的完整定义，由元数据探索器从装饰器元数据中提取。
 */
export interface EventOrMessageListenerDefinition {
  /** 消息模式列表（一个方法可声明多个 pattern） */
  patterns: PatternMetadata[];
  /** 控制器方法名 */
  methodKey: string;
  /** 是否为事件处理器（@EventPattern 则为 true） */
  isEventHandler: boolean;
  /** 绑定到实例的原始回调方法 */
  targetCallback: (...args: any[]) => any;
  /** 通过 @EventPattern({ transport }) 指定的目标传输层（可选） */
  transport?: Transport;
  /** 装饰器额外元数据（如 kafka 的 raw 消息开关） */
  extras?: Record<string, any>;
}

/**
 * 描述请求-响应式消息的请求模式与响应模式（gRPC 场景下两者可能不同）。
 */
export interface MessageRequestProperties {
  /** 请求（接收消息）使用的模式 */
  requestPattern: PatternMetadata;
  /** 回复（发送响应）使用的模式 */
  replyPattern: PatternMetadata;
}

/**
 * 监听器元数据探索器：负责扫描控制器实例，读取装饰器写入的反射元数据。
 *
 * 1. explore()：找出实例上所有 @EventPattern / @MessagePattern 标记的方法；
 * 2. scanForClientHooks()：找出实例上所有 @Client 标记的属性。
 * 结果由 ListenersController 消费，用于注册消息处理器与创建客户端实例。
 */
export class ListenerMetadataExplorer {
  constructor(private readonly metadataScanner: MetadataScanner) {}

  /**
   * 扫描实例原型上的所有方法，提取全部消息/事件监听器定义。
   * @param instance - 控制器实例
   * @returns 监听器定义数组
   */
  public explore(instance: Controller): EventOrMessageListenerDefinition[] {
    const instancePrototype = Object.getPrototypeOf(instance);
    return this.metadataScanner
      .getAllMethodNames(instancePrototype)
      .map(
        method =>
          this.exploreMethodMetadata(instance, instancePrototype, method)!,
      )
      .filter(metadata => metadata);
  }

  /**
   * 读取单个方法上的装饰器元数据，构造监听器定义。
   * 1. 读取 PATTERN_HANDLER_METADATA 判断该方法是否为消息/事件处理器，否则返回 undefined；
   * 2. 读取模式、传输层类型与额外元数据；
   * 3. 组装 EventOrMessageListenerDefinition（isEventHandler 由处理器类型决定）。
   * @param instance - 控制器实例
   * @param instancePrototype - 实例原型（用于读取元数据）
   * @param methodKey - 方法名
   * @returns 监听器定义，方法未标记模式装饰器时为 undefined
   */
  public exploreMethodMetadata(
    instance: Controller,
    instancePrototype: object,
    methodKey: string,
  ): EventOrMessageListenerDefinition | undefined {
    const prototypeCallback = instancePrototype[methodKey];
    const handlerType = Reflect.getMetadata(
      PATTERN_HANDLER_METADATA,
      prototypeCallback,
    );
    if (isUndefined(handlerType)) {
      return;
    }
    const patterns = Reflect.getMetadata(PATTERN_METADATA, prototypeCallback);
    const transport = Reflect.getMetadata(
      TRANSPORT_METADATA,
      prototypeCallback,
    );
    const extras = Reflect.getMetadata(
      PATTERN_EXTRAS_METADATA,
      prototypeCallback,
    );

    const targetCallback = instance[methodKey];
    return {
      methodKey,
      targetCallback,
      patterns,
      transport,
      extras,
      isEventHandler: handlerType === PatternHandler.EVENT,
    };
  }

  /**
   * 扫描实例上所有由 @Client 标记的属性（生成器，逐个产出）。
   * @param instance - 控制器或 provider 实例
   * @returns 逐个产出 { 属性名, 客户端配置 }
   */
  public *scanForClientHooks(
    instance: Controller,
  ): IterableIterator<ClientProperties> {
    for (const propertyKey in instance) {
      if (isFunction(propertyKey)) {
        continue;
      }
      const property = String(propertyKey);
      const isClient = Reflect.getMetadata(CLIENT_METADATA, instance, property);
      if (isUndefined(isClient)) {
        continue;
      }
      const metadata = Reflect.getMetadata(
        CLIENT_CONFIGURATION_METADATA,
        instance,
        property,
      );
      yield { property, metadata };
    }
  }
}
