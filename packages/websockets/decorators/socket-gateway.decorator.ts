import { GATEWAY_METADATA, GATEWAY_OPTIONS, PORT_METADATA } from '../constants';
import { GatewayMetadata } from '../interfaces';

/**
 * 类装饰器：把一个类标记为 Nest 网关（WebSocket 网关），启用浏览器与服务器之间
 * 实时、双向、基于事件的通信。
 *
 * 处理步骤：
 * 1. 规范化参数：若第一个参数是整数则视为端口，否则视为选项对象（端口默认为 0，
 *    表示复用 HTTP 服务器端口）；
 * 2. 在目标类上写入三个元数据：
 *    - GATEWAY_METADATA：标记该类是网关（SocketModule 扫描的依据）；
 *    - PORT_METADATA：监听端口；
 *    - GATEWAY_OPTIONS：网关选项（path、namespace、transports 等）。
 *
 * @param portOrOptions - 端口（number）或网关选项对象。
 * @param options - 网关选项对象（当第一个参数为端口时使用）。
 * @returns 类装饰器。
 *
 * @publicApi
 */
export function WebSocketGateway(port?: number): ClassDecorator;
export function WebSocketGateway<
  T extends Record<string, any> = GatewayMetadata,
>(options?: T): ClassDecorator;
export function WebSocketGateway<
  T extends Record<string, any> = GatewayMetadata,
>(port?: number, options?: T): ClassDecorator;
export function WebSocketGateway<
  T extends Record<string, any> = GatewayMetadata,
>(portOrOptions?: number | T, options?: T): ClassDecorator {
  const isPortInt = Number.isInteger(portOrOptions as number);
  // eslint-disable-next-line prefer-const
  let [port, opt] = isPortInt ? [portOrOptions, options] : [0, portOrOptions];

  opt = opt || ({} as T);
  return (target: object) => {
    Reflect.defineMetadata(GATEWAY_METADATA, true, target);
    Reflect.defineMetadata(PORT_METADATA, port, target);
    Reflect.defineMetadata(GATEWAY_OPTIONS, opt, target);
  };
}
