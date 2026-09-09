import { Observable } from 'rxjs';

/**
 * 消息处理器：@MessagePattern/@EventPattern 标注的方法在服务端注册表中
 * 的运行时形态。除调用签名外，还挂载运行时元数据：
 * - next：同一 pattern 下的下一个事件处理器（@EventPattern 链表，依次执行）；
 * - isEventHandler：是否为事件处理器（@EventPattern，无需回发响应）；
 * - extras：装饰器附加的元数据（如 MQTT qos、NATS queue、版本号等）。
 *
 * @publicApi
 * @typeParam TInput - 消息负载类型
 * @typeParam TContext - RPC 上下文类型（TcpContext/KafkaContext 等）
 * @typeParam TResult - 处理结果类型
 */
export interface MessageHandler<TInput = any, TContext = any, TResult = any> {
  /**
   * 处理一条消息。
   * @param data 反序列化后的消息负载
   * @param ctx RPC 上下文（含传输层元信息）
   * @returns 处理结果（值或 Observable 流，支持多值响应）
   */
  (
    data: TInput,
    ctx?: TContext,
  ): Promise<Observable<TResult>> | Promise<TResult>;
  next?: (
    data: TInput,
    ctx?: TContext,
  ) => Promise<Observable<TResult>> | Promise<TResult>;
  isEventHandler?: boolean;
  extras?: Record<string, any>;
}
