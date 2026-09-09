/**
 * 消息包的标识接口：id 用于在 RPC 场景下把响应与请求配对；
 * 无 id 的包视为事件消息（无需响应）。
 */
export interface PacketId {
  id: string;
}

/**
 * 入站（读取方向）消息包：pattern 为消息模式（路由依据），
 * data 为反序列化后的消息负载。
 */
export interface ReadPacket<T = any> {
  pattern: any;
  data: T;
}

/**
 * 出站（写入方向）消息包：正常响应放 response、错误放 err、
 * isDisposed 标记响应流结束（客户端据此停止等待）、status 为状态码。
 */
export interface WritePacket<T = any> {
  err?: any;
  response?: T;
  isDisposed?: boolean;
  status?: string;
}

/** 客户端发出的 RPC 请求包（ReadPacket + id）。 */
export type OutgoingRequest = ReadPacket & PacketId;
/** 服务端收到的 RPC 请求包（ReadPacket + id）。 */
export type IncomingRequest = ReadPacket & PacketId;
/** 客户端发出的事件消息包（无 id，无需响应）。 */
export type OutgoingEvent = ReadPacket;
/** 服务端收到的事件消息包。 */
export type IncomingEvent = ReadPacket;
/** 客户端收到的响应包（WritePacket + id）。 */
export type IncomingResponse = WritePacket & PacketId;
/** 服务端回发的响应包（WritePacket + id）。 */
export type OutgoingResponse = WritePacket & PacketId;
