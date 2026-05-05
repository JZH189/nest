/**
 * @publicApi
 */
export class InvalidJSONFormatException extends Error {
  constructor(err: Error, data: string) {
    super(`无法解析 JSON：${err.message}\n请求数据：${data}`);
  }
}
