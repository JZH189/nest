/**
 * RabbitMQ 消息发布选项：透传给 amqplib 的发布参数，
 * 可控制持久化、优先级、过期时间、内容类型等 broker 行为。
 *
 * @publicApi
 */
export interface RmqRecordOptions {
  expiration?: string | number;
  userId?: string;
  CC?: string | string[];
  mandatory?: boolean;
  persistent?: boolean;
  deliveryMode?: boolean | number;
  BCC?: string | string[];
  contentType?: string;
  contentEncoding?: string;
  headers?: Record<string, string>;
  priority?: number;
  messageId?: string;
  timestamp?: number;
  type?: string;
  appId?: string;
}

/**
 * RabbitMQ 消息记录：包裹实际负载 data 与发布选项 options。
 * 由 `RmqRecordBuilder` 构造，发送时由 `RmqRecordSerializer` 解包处理。
 *
 * @publicApi
 */
export class RmqRecord<TData = any> {
  /**
   * @param data - 实际要发送的消息负载
   * @param options - RabbitMQ 发布选项（持久化、优先级、过期时间等）
   */
  constructor(
    public readonly data: TData,
    public options?: RmqRecordOptions,
  ) {}
}

/**
 * RabbitMQ 消息记录构造器（链式 Builder 模式）。
 *
 * 用于在通过 `client.emit()` 发送消息时携带 amqplib 的发布选项，
 * 例如设置消息持久化、优先级或过期时间。
 *
 * @publicApi
 */
export class RmqRecordBuilder<TData> {
  private options?: RmqRecordOptions;

  /**
   * @param data - 初始消息负载（可后续通过 setData 覆盖）
   */
  constructor(private data?: TData) {}

  /**
   * 设置 RabbitMQ 发布选项（整体替换，非合并）。
   * @param options - amqplib 发布选项对象
   * @returns 当前 builder 实例（支持链式调用）
   */
  public setOptions(options: RmqRecordOptions): this {
    this.options = options;
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
   * 构造最终的 RmqRecord 记录对象。
   * @returns 包含负载与发布选项的 RmqRecord 实例
   */
  public build(): RmqRecord {
    return new RmqRecord(this.data, this.options);
  }
}
