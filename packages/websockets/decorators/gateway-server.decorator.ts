import { GATEWAY_SERVER_METADATA } from '../constants';

/**
 * 属性装饰器：将底层原生 WebSocket 服务器实例注入到网关类的指定属性中。
 *
 * 处理步骤：
 * 1. 先把属性初始化为 null（避免 TS 严格属性检查报错）；
 * 2. 在属性上写入 GATEWAY_SERVER_METADATA 元数据，
 *    GatewayMetadataExplorer.scanForServerHooks 会据此找到注入点，
 *    并由 WebSocketsController.assignServerToProperties 完成实际赋值。
 *
 * @example
 * ```typescript
 * @WebSocketGateway()
 * export class EventsGateway {
 *   @WebSocketServer()
 *   server: Server;
 * }
 * ```
 *
 * @publicApi
 */
export const WebSocketServer = (): PropertyDecorator => {
  return (target: object, propertyKey: string | symbol) => {
    Reflect.set(target, propertyKey, null);
    Reflect.defineMetadata(GATEWAY_SERVER_METADATA, true, target, propertyKey);
  };
};
