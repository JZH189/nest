import { TcpSocket } from '../helpers';
import { BaseRpcContext } from './base-rpc.context';

type TcpContextArgs = [TcpSocket, string];

/**
 * TCP 传输层的 RPC 上下文宿主。
 * args 约定：[socket 封装（JsonSocket 等）, pattern 字符串]。
 * 在处理器中通过 @Ctx() 注入后可访问底层 socket 与消息模式。
 *
 * @publicApi
 */
export class TcpContext extends BaseRpcContext<TcpContextArgs> {
  constructor(args: TcpContextArgs) {
    super(args);
  }

  /**
   * 返回底层 socket 封装（可通过其向客户端回写消息）。
   */
  getSocketRef() {
    return this.args[0];
  }

  /**
   * 返回消息模式名称。
   */
  getPattern() {
    return this.args[1];
  }
}
