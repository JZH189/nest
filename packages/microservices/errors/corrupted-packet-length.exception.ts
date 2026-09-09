/**
 * 当消息包头部声明的长度值无法通过校验（与实际内容不匹配）时抛出，用于 TCP 传输层的分包解析。
 *
 * @publicApi
 */
export class CorruptedPacketLengthException extends Error {
  constructor(rawContentLength: string) {
    super(`包中提供的长度值已损坏："${rawContentLength}"`);
  }
}
