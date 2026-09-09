import { BaseRpcContext } from './base-rpc.context';

type NatsContextArgs = [string, any];

/**
 * NATS 传输层的 RPC 上下文宿主。
 * args 约定：[subject（主题）名, 消息头 headers]。
 * 在处理器中通过 @Ctx() 注入后可访问消息 subject 与 headers。
 *
 * @publicApi
 */
export class NatsContext extends BaseRpcContext<NatsContextArgs> {
  constructor(args: NatsContextArgs) {
    super(args);
  }

  /**
   * 返回消息 subject（NATS 主题）名称。
   */
  getSubject() {
    return this.args[0];
  }

  /**
   * 返回消息头（若存在）。
   */
  getHeaders() {
    return this.args[1];
  }
}
