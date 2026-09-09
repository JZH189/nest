import { RpcParamtype } from '../enums/rpc-paramtype.enum';

/**
 * RPC 参数工厂。
 *
 * Nest 参数装饰器体系（@Payload、@Ctx 等）在运行时依赖"参数工厂"把
 * 消息处理器的参数元数据（type/data）解析为实际注入值。本类负责根据
 * 参数类型从 RPC 处理参数数组 `args` 中取出对应位置的值：
 * - args[0]：消息负载（message/data）；
 * - args[1]：RPC 上下文（如 Kafka/MQTT 的原始消息与通道信息）；
 * - args[2]：gRPC 专属的 Metadata / call 对象等附加参数。
 */
export class RpcParamsFactory {
  /**
   * 按参数类型从 RPC 处理参数数组中取出要注入的值。
   * @param type - 参数类型（RpcParamtype 枚举：PAYLOAD / CONTEXT / GRPC_CALL）
   * @param data - 装饰器元数据（如 @Payload('field') 中的字段名）
   * @param args - 消息处理器被调用时的实际参数数组 [负载, 上下文, gRPC 附加参数]
   * @returns 解析出的注入值；无法解析时返回 null
   */
  public exchangeKeyForValue(
    type: number,
    data: string | undefined,
    args: unknown[],
  ) {
    // 1. 无参数数组时无法注入任何值
    if (!args) {
      return null;
    }
    switch (type as RpcParamtype) {
      // 2. PAYLOAD：默认注入整个负载；指定了字段名则只取负载中的对应属性
      case RpcParamtype.PAYLOAD:
        return data ? args[0]?.[data] : args[0];
      // 3. CONTEXT：注入 RPC 上下文对象
      case RpcParamtype.CONTEXT:
        return args[1];
      // 4. GRPC_CALL：注入 gRPC 专属的附加参数（Metadata / call 等）
      case RpcParamtype.GRPC_CALL:
        return args[2];
      default:
        return null;
    }
  }
}
