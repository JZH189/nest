/**
 * MQTT 消息发布选项：可在发送时精细控制 MQTT 协议行为
 * （QoS 等级、retain 标记、dup 标记及 MQTT 5.0 properties）。
 *
 * @publicApi
 */
export interface MqttRecordOptions {
  /**
   * The QoS
   */
  qos?: 0 | 1 | 2;
  /**
   * The retain flag
   */
  retain?: boolean;
  /**
   * Whether or not mark a message as duplicate
   */
  dup?: boolean;
  /*
   *  MQTT 5.0 properties object
   */
  properties?: {
    payloadFormatIndicator?: boolean;
    messageExpiryInterval?: number;
    topicAlias?: number;
    responseTopic?: string;
    correlationData?: Buffer;
    userProperties?: Record<string, string | string[]>;
    subscriptionIdentifier?: number;
    contentType?: string;
  };
}

/**
 * MQTT 消息记录：包裹实际负载 data 与发布选项 options。
 * 由 `MqttRecordBuilder` 构造，发送时由 `MqttRecordSerializer` 解包处理。
 *
 * @publicApi
 */
export class MqttRecord<TData = any> {
  /**
   * @param data - 实际要发送的消息负载
   * @param options - MQTT 发布选项（QoS、retain 等）
   */
  constructor(
    public readonly data: TData,
    public options?: MqttRecordOptions,
  ) {}
}

/**
 * MQTT 消息记录构造器（链式 Builder 模式）。
 *
 * 用于在通过 `client.emit()` 发送消息时携带 MQTT 专属的发布选项，
 * 例如设置 QoS 等级、retain 标记或 MQTT 5.0 properties。
 *
 * @publicApi
 */
export class MqttRecordBuilder<TData> {
  private options?: MqttRecordOptions;

  /**
   * @param data - 初始消息负载（可后续通过 setData 覆盖）
   */
  constructor(private data?: TData) {}

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
   * 设置 QoS（服务质量）等级。
   * @param qos - 0：至多一次；1：至少一次；2：恰好一次
   * @returns 当前 builder 实例（支持链式调用）
   */
  public setQoS(qos: MqttRecordOptions['qos']): this {
    this.options = {
      ...this.options,
      qos,
    };
    return this;
  }

  /**
   * 设置 retain（保留消息）标记：为 true 时 broker 会保留该消息，
   * 后续订阅者会立即收到最后一条保留消息。
   * @param retain - 是否保留消息
   * @returns 当前 builder 实例（支持链式调用）
   */
  public setRetain(retain: MqttRecordOptions['retain']): this {
    this.options = {
      ...this.options,
      retain,
    };
    return this;
  }

  /**
   * 设置 dup（重复投递）标记：标识该消息是否为重发的副本。
   * @param dup - 是否标记为重复消息
   * @returns 当前 builder 实例（支持链式调用）
   */
  public setDup(dup: MqttRecordOptions['dup']): this {
    this.options = {
      ...this.options,
      dup,
    };
    return this;
  }

  /**
   * 设置 MQTT 5.0 properties（如消息过期时间、关联数据、内容类型等）。
   * @param properties - MQTT 5.0 属性对象
   * @returns 当前 builder 实例（支持链式调用）
   */
  public setProperties(properties: MqttRecordOptions['properties']): this {
    this.options = {
      ...this.options,
      properties,
    };
    return this;
  }

  /**
   * 构造最终的 MqttRecord 记录对象。
   * @returns 包含负载与全部已设置选项的 MqttRecord 实例
   */
  public build(): MqttRecord {
    return new MqttRecord(this.data, this.options);
  }
}
