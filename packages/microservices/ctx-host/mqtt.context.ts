import { BaseRpcContext } from './base-rpc.context';

type MqttContextArgs = [string, Record<string, any>];

/**
 * MQTT 传输层的 RPC 上下文宿主。
 * args 约定：[主题（topic）名, 原始 MQTT packet]。
 * 在处理器中通过 @Ctx() 注入后可访问消息主题与原始报文（含 qos、retain 等）。
 *
 * @publicApi
 */
export class MqttContext extends BaseRpcContext<MqttContextArgs> {
  constructor(args: MqttContextArgs) {
    super(args);
  }

  /**
   * 返回消息主题（topic）名称。
   */
  getTopic() {
    return this.args[0];
  }

  /**
   * 返回原始 MQTT packet 引用。
   */
  getPacket() {
    return this.args[1];
  }
}
