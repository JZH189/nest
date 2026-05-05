/**
 * @publicApi
 */
export class NetSocketClosedException extends Error {
  constructor() {
    super(`网络套接字已关闭。`);
  }
}
