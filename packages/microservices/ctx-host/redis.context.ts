import { BaseRpcContext } from './base-rpc.context';

type RedisContextArgs = [string];

/**
 * Redis（Pub/Sub）传输层的 RPC 上下文宿主。
 * args 约定：[通道（channel）名]。
 * 在处理器中通过 @Ctx() 注入后可访问收到消息的 Redis 通道名。
 *
 * @publicApi
 */
export class RedisContext extends BaseRpcContext<RedisContextArgs> {
  constructor(args: RedisContextArgs) {
    super(args);
  }

  /**
   * 返回消息所在的 Redis 通道名。
   */
  getChannel() {
    return this.args[0];
  }
}
