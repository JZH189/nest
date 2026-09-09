import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

/**
 * WebSocket 参数类型枚举：标识 @ConnectedSocket / @MessageBody / @Ack
 * 三种参数装饰器对应的取值来源。
 *
 * 数值上刻意复用 HTTP 侧 RouteParamtypes 的枚举值（REQUEST/BODY/...），
 * 以便与 @nestjs/core 的 ContextUtils（mapParamType/mergeParamsMetatypes）
 * 等通用工具保持兼容。
 */
export enum WsParamtype {
  /** 客户端 socket 实例（对应 HTTP 的 REQUEST，运行时参数第 0 位）。 */
  SOCKET = RouteParamtypes.REQUEST,
  /** 消息负载（对应 HTTP 的 BODY，运行时参数第 1 位）。 */
  PAYLOAD = RouteParamtypes.BODY,
  /** ACK 确认回调（运行时参数第 2 位）。 */
  ACK = RouteParamtypes.ACK,
}
