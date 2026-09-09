/**
 * 对底层 HTTP 响应对象的最小抽象，供流式传输的错误处理逻辑使用。
 * 真实的 Express / Fastify 响应对象都满足此结构，
 * 使 `StreamableFile` 的错误处理器可以跨 HTTP 适配器工作。
 */
export interface StreamableHandlerResponse {
  /** `true` 表示连接已销毁（例如客户端已断开），否则为 `false`。 */
  destroyed: boolean;
  /** `true` 表示响应头已发送，否则为 `false`。 */
  headersSent: boolean;
  /** 响应头被刷出（flush）时将发送给客户端的状态码。 */
  statusCode: number;
  /** 发送 HTTP 响应体。 */
  send: (body: string) => void;
  /** 通知服务器所有响应头与响应体均已发送完毕，结束本次响应。 */
  end: () => void;
}
