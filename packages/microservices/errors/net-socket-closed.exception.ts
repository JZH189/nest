/**
 * 当底层网络套接字已被关闭、无法继续读写数据时抛出。
 *
 * @publicApi
 */
export class NetSocketClosedException extends Error {
  constructor() {
    super(`网络套接字已关闭。`);
  }
}
