/**
 * 当接收到的原始数据不是合法的 JSON、无法完成反序列化时抛出。
 *
 * @publicApi
 */
export class InvalidJSONFormatException extends Error {
  constructor(err: Error, data: string) {
    super(`无法解析 JSON：${err.message}\n请求数据：${data}`);
  }
}
