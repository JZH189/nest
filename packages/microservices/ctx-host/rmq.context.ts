import { BaseRpcContext } from './base-rpc.context';

type RmqContextArgs = [Record<string, any>, any, string];

/**
 * RabbitMQ（RMQ）传输层的 RPC 上下文宿主。
 * args 约定：[原始消息（含 properties/fields/content）, channel 引用, pattern 字符串]。
 * 在处理器中通过 @Ctx() 注入后可访问原始消息与通道，
 * 常用于手动 ack/nack（msg.properties.correlationId、channelRef.ack 等）。
 *
 * @publicApi
 */
export class RmqContext extends BaseRpcContext<RmqContextArgs> {
  constructor(args: RmqContextArgs) {
    super(args);
  }

  /**
   * 返回原始消息（含 properties、fields 与 content）。
   */
  getMessage() {
    return this.args[0];
  }

  /**
   * 返回原始 RMQ channel 引用。
   */
  getChannelRef() {
    return this.args[1];
  }

  /**
   * 返回消息模式名称。
   */
  getPattern() {
    return this.args[2];
  }
}
