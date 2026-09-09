/**
 * 当请求分发后没有任何订阅者监听对应的消息模式（pattern）、导致响应为空时抛出。
 *
 * @publicApi
 */
export class EmptyResponseException extends Error {
  constructor(pattern: string) {
    super(
      `空响应。没有订阅者监听该消息（"${pattern}"）`,
    );
  }
}
