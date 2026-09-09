import { isFunction } from '@nestjs/common/utils/shared.utils';
import { WsParamtype } from '../enums/ws-paramtype.enum';

/**
 * WebSocket 参数工厂：根据参数类型从运行时参数（adapter 传入的
 * [client, data, ...ack]）中提取注入到处理方法参数的值。
 * 对应 HTTP 侧的 RouteParamsFactory。
 */
export class WsParamsFactory {
  /**
   * 按参数类型提取实际值。
   *
   * 处理步骤：
   * 1. SOCKET：返回第 0 位参数（客户端 socket 实例）；
   * 2. PAYLOAD：返回第 1 位参数（消息负载）；若指定了属性名 data，
   *    则返回负载中对应属性的值；
   * 3. ACK：在参数中查找第一个函数类型的参数（即 ACK 确认回调）；
   * 4. 其余类型返回 null。
   *
   * @param type - 参数类型（WsParamtype 的数值）。
   * @param data - @MessageBody('xxx') 指定的属性名（可选）。
   * @param args - 运行时参数数组 [client, data, ack?]。
   * @returns 提取到的参数值；无法提取时为 null。
   */
  public exchangeKeyForValue(
    type: number,
    data: string | undefined,
    args: unknown[],
  ) {
    if (!args) {
      return null;
    }
    switch (type as WsParamtype) {
      case WsParamtype.SOCKET:
        return args[0];
      case WsParamtype.PAYLOAD:
        return data ? args[1]?.[data] : args[1];
      case WsParamtype.ACK: {
        return args.find(arg => isFunction(arg));
      }
      default:
        return null;
    }
  }
}
