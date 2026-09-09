import { WsParamtype } from '../enums/ws-paramtype.enum';
import { createWsParamDecorator } from '../utils/param.utils';

/**
 * 参数装饰器：把当前连接的客户端 socket 实例注入到被装饰的参数中
 * （从运行时参数的第 0 位提取，即 WsParamtype.SOCKET）。
 *
 * @example
 * ```typescript
 * @SubscribeMessage('events')
 * onEvent(@ConnectedSocket() client: Socket) { ... }
 * ```
 *
 * @publicApi
 */
export const ConnectedSocket: () => ParameterDecorator = createWsParamDecorator(
  WsParamtype.SOCKET,
);
