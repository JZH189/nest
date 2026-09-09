import { WsParamtype } from '../enums/ws-paramtype.enum';

/**
 * 默认的参数装饰器元数据：当处理方法没有任何参数装饰器元数据时使用。
 * 约定运行时参数顺序为 [client(0), data/payload(1), ack(2)]，
 * 键格式为 "<WsParamtype>:<index>"，这样 @ConnectedSocket/@MessageBody 等
 * 参数装饰器缺失时方法仍能按默认位置注入。
 */
export const DEFAULT_CALLBACK_METADATA = {
  [`${WsParamtype.ACK}:2`]: { index: 2, data: undefined, pipes: [] },
  [`${WsParamtype.PAYLOAD}:1`]: { index: 1, data: undefined, pipes: [] },
  [`${WsParamtype.SOCKET}:0`]: { index: 0, data: undefined, pipes: [] },
};
