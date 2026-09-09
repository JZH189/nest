import { RpcParamtype } from '../enums/rpc-paramtype.enum';

/**
 * 无参数装饰器时使用的默认回调元数据：第 0 个参数即消息数据（@Payload）。
 * 键格式为 "{参数类型}:{参数索引}"。
 */
export const DEFAULT_CALLBACK_METADATA = {
  [`${RpcParamtype.PAYLOAD}:0`]: { index: 0, data: undefined, pipes: [] },
};
/**
 * gRPC 处理器使用的默认回调元数据：
 * 第 1 个参数为 RpcArgumentsHost（@Ctx），第 2 个参数为 gRPC call 对象，
 * 并叠加默认的 PAYLOAD 参数。
 */
export const DEFAULT_GRPC_CALLBACK_METADATA = {
  [`${RpcParamtype.CONTEXT}:1`]: { index: 1, data: undefined, pipes: [] },
  [`${RpcParamtype.GRPC_CALL}:2`]: { index: 2, data: undefined, pipes: [] },
  ...DEFAULT_CALLBACK_METADATA,
};
