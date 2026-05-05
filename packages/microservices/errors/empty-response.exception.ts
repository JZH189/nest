/**
 * @publicApi
 */
export class EmptyResponseException extends Error {
  constructor(pattern: string) {
    super(
      `空响应。没有订阅者监听该消息（"${pattern}"）`,
    );
  }
}
