/**
 * 描述一条 Server-Sent Events（SSE）消息事件。
 * 在 `@Sse()` 路由中，处理方法返回的 Observable 所发出的对象需符合此结构，
 * 最终被序列化为 `data:` 事件帧发送给客户端。
 */
export interface MessageEvent {
  /** 消息内容 */
  data: string | object;
  /** 事件 ID，写入 `id:` 字段 */
  id?: string;
  /** 事件类型，写入 `event:` 字段 */
  type?: string;
  /** 客户端重连的等待毫秒数，写入 `retry:` 字段 */
  retry?: number;
}
