/**
 * NATS 消息记录：包裹实际负载 data 与可选的 NATS 消息头 headers。
 * 由 `NatsRecordBuilder` 构造，发送时由 `NatsRecordSerializer` 处理。
 *
 * @publicApi
 */
export class NatsRecord<TData = any, THeaders = any> {
  /**
   * @param data - 实际要发送的消息负载
   * @param headers - NATS 消息头（可用于传递元信息，如路由版本、追踪 id）
   */
  constructor(
    public readonly data: TData,
    public readonly headers?: THeaders,
  ) {}
}

/**
 * NATS 消息记录构造器（链式 Builder 模式）。
 *
 * 用于在通过 `client.emit()` / `client.send()` 发送消息时附带
 * NATS 消息头（headers），例如实现请求追踪或灰度路由。
 *
 * @publicApi
 */
export class NatsRecordBuilder<TData> {
  private headers?: any;

  /**
   * @param data - 初始消息负载（可后续通过 setData 覆盖）
   */
  constructor(private data?: TData) {}

  /**
   * 设置 NATS 消息头。
   * @param headers - 消息头对象（可为 NatsMsg headers 实例或普通对象）
   * @returns 当前 builder 实例（支持链式调用）
   */
  public setHeaders<THeaders = any>(headers: THeaders): this {
    this.headers = headers;
    return this;
  }

  /**
   * 设置（覆盖）消息负载。
   * @param data - 新的消息负载
   * @returns 当前 builder 实例（支持链式调用）
   */
  public setData(data: TData): this {
    this.data = data;
    return this;
  }

  /**
   * 构造最终的 NatsRecord 记录对象。
   * @returns 包含负载与消息头的 NatsRecord 实例
   */
  public build(): NatsRecord {
    return new NatsRecord(this.data, this.headers);
  }
}
