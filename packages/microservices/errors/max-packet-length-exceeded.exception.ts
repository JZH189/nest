/**
 * @publicApi
 */
export class MaxPacketLengthExceededException extends Error {
  constructor(length: number) {
    super(`数据包长度（${length}）超过允许的最大长度`);
  }
}
