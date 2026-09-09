import { RpcParamtype } from '../enums/rpc-paramtype.enum';
import { createRpcParamDecorator } from '../utils/param.utils';

/**
 * 上下文参数装饰器：把传输层的 RPC 上下文宿主注入到处理器参数中
 * （如 TcpContext、KafkaContext、RmqContext 等，见 ctx-host 目录）。
 * 写入 PARAM_ARGS_METADATA 元数据（RpcParamtype.CONTEXT），
 * 由 RpcContextCreator / RpcParamsFactory 在调用处理器时解析取值。
 */
export const Ctx: () => ParameterDecorator = createRpcParamDecorator(
  RpcParamtype.CONTEXT,
);
