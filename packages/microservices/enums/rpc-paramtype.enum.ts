import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

/**
 * RPC 参数类型枚举：复用 HTTP 路由参数类型键（值相同），
 * 用于在 PARAM_ARGS_METADATA 中标识参数装饰器的种类——
 * PAYLOAD：消息数据（@Payload）；CONTEXT：RPC 上下文（@Ctx）；
 * GRPC_CALL：gRPC 原生 call 对象。由 RpcParamsFactory 解析取值。
 */
export enum RpcParamtype {
  PAYLOAD = RouteParamtypes.BODY,
  CONTEXT = RouteParamtypes.HEADERS,
  GRPC_CALL = RouteParamtypes.FILES,
}
