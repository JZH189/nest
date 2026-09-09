/**
 * 当数据包长度超过传输层允许的最大限制（防止恶意超大包占用内存）时抛出。
 *
 * @publicApi
 */
export class MaxPacketLengthExceededException extends Error {
  constructor(length: number) {
    super(`数据包长度（${length}）超过允许的最大长度`);
  }
}
