import { isFunction, isUndefined } from '@nestjs/common/utils/shared.utils';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { Observable } from 'rxjs';
import {
  GATEWAY_SERVER_METADATA,
  MESSAGE_MAPPING_METADATA,
  MESSAGE_METADATA,
  PARAM_ARGS_METADATA,
} from './constants';
import { NestGateway } from './interfaces/nest-gateway.interface';
import { ParamsMetadata } from '@nestjs/core/helpers/interfaces';
import { WsParamtype } from './enums/ws-paramtype.enum';
import { ContextUtils } from '@nestjs/core/helpers/context-utils';

/**
 * 消息映射属性：描述网关类中一个被 @SubscribeMessage 标记的处理方法。
 */
export interface MessageMappingProperties {
  /** 订阅的消息事件名（@SubscribeMessage 的参数）。 */
  message: any;
  /** 处理方法在网关类中的方法名。 */
  methodName: string;
  /** 原始处理方法回调（尚未包装上下文）。 */
  callback: (...args: any[]) => Observable<any> | Promise<any>;
  /** 是否通过 @Ack 装饰器手动处理 ACK（确认应答）。 */
  isAckHandledManually: boolean;
}

/**
 * 网关元数据探测器：扫描网关实例，提取两类信息：
 * 1. 所有 @SubscribeMessage 标记的消息处理方法（explore）；
 * 2. 所有 @WebSocketServer 标记的服务器注入属性（scanForServerHooks）。
 */
export class GatewayMetadataExplorer {
  private readonly contextUtils = new ContextUtils();
  /**
   * @param metadataScanner - 方法名扫描器（来自 @nestjs/core），用于枚举原型上的方法。
   */
  constructor(private readonly metadataScanner: MetadataScanner) {}

  /**
   * 探测网关实例上全部消息处理方法。
   *
   * 处理步骤：
   * 1. 获取实例原型；
   * 2. 扫描原型上的所有方法名，并对每个方法调用 exploreMethodMetadata；
   * 3. 过滤掉未标记 @SubscribeMessage 的方法（返回 null 的项）。
   *
   * @param instance - 网关实例。
   * @returns 该网关全部消息处理方法的映射数组。
   */
  public explore(instance: NestGateway): MessageMappingProperties[] {
    const instancePrototype = Object.getPrototypeOf(instance);
    return this.metadataScanner
      .getAllMethodNames(instancePrototype)
      .map(method => this.exploreMethodMetadata(instancePrototype, method)!)
      .filter(metadata => metadata);
  }

  /**
   * 探测单个方法的消息映射元数据。
   *
   * 处理步骤：
   * 1. 取出原型上的方法回调，检查其是否携带 MESSAGE_MAPPING_METADATA
   *    （由 @SubscribeMessage 写入），没有则返回 null；
   * 2. 读取 MESSAGE_METADATA 得到订阅的消息名；
   * 3. 检查该方法是否有 @Ack 装饰器（手动处理确认应答）；
   * 4. 组装并返回 MessageMappingProperties。
   *
   * @param instancePrototype - 网关实例的原型对象。
   * @param methodName - 待探测的方法名。
   * @returns 消息映射属性；方法未被 @SubscribeMessage 标记时返回 null。
   */
  public exploreMethodMetadata(
    instancePrototype: object,
    methodName: string,
  ): MessageMappingProperties | null {
    const callback = instancePrototype[methodName];
    const isMessageMapping = Reflect.getMetadata(
      MESSAGE_MAPPING_METADATA,
      callback,
    );
    if (isUndefined(isMessageMapping)) {
      return null;
    }
    const message = Reflect.getMetadata(MESSAGE_METADATA, callback);
    const isAckHandledManually = this.hasAckDecorator(
      instancePrototype,
      methodName,
    );

    return {
      callback,
      message,
      methodName,
      isAckHandledManually,
    };
  }

  /**
   * 判断方法是否被 @Ack 装饰器标记（即手动处理 ACK 应答）。
   *
   * 处理步骤：
   * 1. 读取方法上的参数装饰器元数据（PARAM_ARGS_METADATA）；
   * 2. 无元数据则返回 false；
   * 3. 遍历参数元数据键，将其映射为 WsParamtype 枚举；
   * 4. 若存在类型为 WsParamtype.ACK 的参数，则返回 true。
   *
   * @param instancePrototype - 网关实例的原型对象。
   * @param methodName - 方法名。
   * @returns 是否存在 ACK 类型的参数装饰器。
   */
  private hasAckDecorator(
    instancePrototype: object,
    methodName: string,
  ): boolean {
    const paramsMetadata: ParamsMetadata = Reflect.getMetadata(
      PARAM_ARGS_METADATA,
      instancePrototype.constructor,
      methodName,
    );

    if (!paramsMetadata) {
      return false;
    }
    const metadataKeys = Object.keys(paramsMetadata);
    return metadataKeys.some(key => {
      const type = this.contextUtils.mapParamType(key);

      return (Number(type) as WsParamtype) === WsParamtype.ACK;
    });
  }

  /**
   * 扫描实例上所有被 @WebSocketServer 标记的属性名（服务器注入点）。
   *
   * 处理步骤：
   * 1. 遍历实例的自有属性；
   * 2. 跳过函数类型的属性键；
   * 3. 读取 GATEWAY_SERVER_METADATA 元数据，若存在则 yield 该属性名。
   *
   * @param instance - 网关实例。
   * @returns 被标记为服务器注入点的属性名迭代器。
   */
  public *scanForServerHooks(instance: NestGateway): IterableIterator<string> {
    for (const propertyKey in instance) {
      if (isFunction(propertyKey)) {
        continue;
      }
      const property = String(propertyKey);
      const isServer = Reflect.getMetadata(
        GATEWAY_SERVER_METADATA,
        instance,
        property,
      );
      if (!isUndefined(isServer)) {
        yield property;
      }
    }
  }
}
