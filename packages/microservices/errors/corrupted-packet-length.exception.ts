/**
 * @publicApi
 */
export class CorruptedPacketLengthException extends Error {
  constructor(rawContentLength: string) {
    super(`包中提供的长度值已损坏："${rawContentLength}"`);
  }
}
