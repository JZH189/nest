import { isObject, isUndefined } from '@nestjs/common/utils/shared.utils';
import {
  MQTT_DEFAULT_URL,
  MQTT_SEPARATOR,
  MQTT_WILDCARD_ALL,
  MQTT_WILDCARD_SINGLE,
  NO_MESSAGE_HANDLER,
} from '../constants';
import { MqttContext } from '../ctx-host/mqtt.context';
import { Transport } from '../enums';
import { MqttEvents, MqttEventsMap, MqttStatus } from '../events/mqtt.events';
import {
  IncomingRequest,
  MessageHandler,
  PacketId,
  ReadPacket,
} from '../interfaces';
import {
  MqttOptions,
  TransportId,
} from '../interfaces/microservice-configuration.interface';
import { MqttRecord } from '../record-builders/mqtt.record-builder';
import { MqttRecordSerializer } from '../serializers/mqtt-record.serializer';
import { Server } from './server';

let mqttPackage: any = {};

// To enable type safety for MQTT. This cant be uncommented by default
// because it would require the user to install the mqtt package even if they dont use MQTT
// Otherwise, TypeScript would fail to compile the code.
//
// type MqttClient = import('mqtt').MqttClient;
type MqttClient = any;

/**
 * 基于 MQTT（mqtt 包）的微服务服务端实现。
 *
 * 工作方式：
 * - MQTT 中没有「服务端」，服务端表现为一个 MQTT 客户端：
 *   把每个 @MessagePattern/@EventPattern 的 pattern 当作 topic 订阅；
 * - 收到消息后反序列化为 ReadPacket，按 channel（topic）查找处理器；
 * - 带 id 的消息是 RPC 请求：执行处理器后向 `{topic}/reply` 主题
 *   发布响应（附原始请求 id）；
 * - 不带 id 的消息是事件：走基类 handleEvent 分发，不回发响应。
 * - 支持通配符订阅（`+` 单层、`#` 多层）与 MQTT 5 共享订阅（$share）。
 *
 * @publicApi
 */
export class ServerMqtt extends Server<MqttEvents, MqttStatus> {
  /** 传输器唯一标识：MQTT。 */
  public transportId: TransportId = Transport.MQTT;
  /** MQTT broker 连接地址（默认 'tcp://localhost:1883'）。 */
  protected readonly url: string;
  /** 底层 mqtt 客户端实例。 */
  protected mqttClient: MqttClient;
  /** 客户端尚未创建时暂存的事件监听器，start() 后统一注册。 */
  protected pendingEventListeners: Array<{
    event: keyof MqttEvents;
    callback: MqttEvents[keyof MqttEvents];
  }> = [];

  /**
   * @param options MQTT 传输选项（url、subscribeOptions、序列化器/反序列化器
   * 以及透传给 mqtt.connect 的其余选项）
   */
  constructor(private readonly options: Required<MqttOptions>['options']) {
    super();
    // 1. 读取 broker 地址（默认本机 1883 端口）
    this.url = this.getOptionsProp(options, 'url', MQTT_DEFAULT_URL);

    // 2. 按需加载 mqtt 依赖包
    mqttPackage = this.loadPackage('mqtt', ServerMqtt.name, () =>
      require('mqtt'),
    );

    // 3. 初始化 MQTT 专属序列化器与默认反序列化器
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 连接 MQTT broker 并开始监听（由应用启动时调用）。
   * @param callback 连接成功或失败后调用的回调
   */
  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    try {
      // 1. 创建 MQTT 客户端并启动
      this.mqttClient = this.createMqttClient();
      this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * 启动流程：注册连接状态事件监听器、补注册暂存的监听器、
   * 订阅所有 pattern（topic），并在连接成功时回调。
   * @param callback 连接成功后调用的回调
   */
  public start(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    // 1. 注册 error/reconnect/disconnect/close/connect 五类状态监听器
    this.registerErrorListener(this.mqttClient);
    this.registerReconnectListener(this.mqttClient);
    this.registerDisconnectListener(this.mqttClient);
    this.registerCloseListener(this.mqttClient);
    this.registerConnectListener(this.mqttClient);

    // 2. 补注册 listen 之前暂存的事件监听器并清空暂存列表
    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.mqttClient.on(event, callback),
    );
    this.pendingEventListeners = [];
    // 3. 订阅所有已注册的 pattern
    this.bindEvents(this.mqttClient);

    this.mqttClient.on(MqttEventsMap.CONNECT, () => callback());
  }

  /**
   * 订阅所有已注册的 pattern（topic），并绑定消息处理函数。
   * 处理器 extras 中可指定 qos，覆盖全局 subscribeOptions。
   * @param mqttClient MQTT 客户端实例
   */
  public bindEvents(mqttClient: MqttClient) {
    // 1. 绑定 'message' 事件到消息处理函数
    mqttClient.on('message', this.getMessageHandler(mqttClient).bind(this));

    // 2. 逐个订阅已注册的 pattern；事件处理器直接订阅 pattern，
    //    RPC 处理器通过 getRequestPattern 转换（默认原样返回）
    const registeredPatterns = [...this.messageHandlers.keys()];
    registeredPatterns.forEach(pattern => {
      const handler = this.messageHandlers.get(pattern)!;
      const { isEventHandler, extras } = handler;

      const globalSubscribeOptions = this.getOptionsProp(
        this.options,
        'subscribeOptions',
      );
      const subscribeOptions =
        extras?.qos !== undefined
          ? { ...globalSubscribeOptions, qos: extras.qos }
          : globalSubscribeOptions;

      mqttClient.subscribe(
        isEventHandler ? pattern : this.getRequestPattern(pattern),
        subscribeOptions,
      );
    });
  }

  /**
   * 关闭 MQTT 连接并清空暂存的事件监听器。
   */
  public close() {
    this.mqttClient && this.mqttClient.end();
    this.pendingEventListeners = [];
  }

  /**
   * 创建 MQTT 客户端实例。
   * @returns mqtt.connect 返回的客户端实例
   */
  public createMqttClient(): MqttClient {
    return mqttPackage.connect(this.url, this.options as MqttOptions);
  }

  /**
   * 返回传给 mqtt 'message' 事件的处理函数。
   * @param pub MQTT 客户端（用于回发响应）
   * @returns 接收 channel/buffer/原始包并转交 handleMessage 的异步函数
   */
  public getMessageHandler(pub: MqttClient) {
    return async (
      channel: string,
      buffer: Buffer,
      originalPacket?: Record<string, any>,
    ) => this.handleMessage(channel, buffer, pub, originalPacket);
  }

  /**
   * 处理单条 MQTT 消息（核心分发逻辑）。
   * @param channel 收到消息的 topic（即消息模式）
   * @param buffer 原始消息内容
   * @param pub MQTT 客户端（用于回发响应）
   * @param originalPacket mqtt 底层原始数据包（供上下文使用）
   */
  public async handleMessage(
    channel: string,
    buffer: Buffer,
    pub: MqttClient,
    originalPacket?: Record<string, any>,
  ): Promise<any> {
    // 1. 解析 JSON 并反序列化为 ReadPacket，构造 MQTT 上下文
    const rawPacket = this.parseMessage(buffer.toString());
    const packet = await this.deserializer.deserialize(rawPacket, { channel });
    const mqttContext = new MqttContext([channel, originalPacket!]);
    // 2. 无 id 说明是事件消息：走基类事件分发，不回发响应
    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(channel, packet, mqttContext);
    }
    // 3. RPC 请求：构造向 {topic}/reply 发布响应的发布函数
    const publish = this.getPublisher(
      pub,
      mqttContext,
      (packet as IncomingRequest).id,
    );
    const handler = this.getHandlerByPattern(channel);

    if (!handler) {
      // 4. 未注册处理器：回发带 NO_MESSAGE_HANDLER 错误的响应
      const status = 'error';
      const noHandlerPacket = {
        id: (packet as IncomingRequest).id,
        status,
        err: NO_MESSAGE_HANDLER,
      };
      return publish(noHandlerPacket);
    }
    // 5. 执行处理器：结果转为 Observable，经 send() 串行发布响应
    return this.onProcessingStartHook(
      this.transportId,
      mqttContext,
      async () => {
        const response$ = this.transformToObservable(
          await handler(packet.data, mqttContext),
        );
        response$ && this.send(response$, publish);
      },
    );
  }

  /**
   * 构造响应发布函数：把响应序列化后发布到请求 topic 对应的
   * reply 主题（`{topic}/reply`），并附上原始请求 id。
   * 响应 data 为 MqttRecord 时可携带自定义发布选项（如 qos/retain）。
   *
   * @param client MQTT 客户端
   * @param context MQTT 上下文（含请求 topic）
   * @param id 原始请求 id
   * @returns 执行响应发布的函数
   */
  public getPublisher(
    client: MqttClient,
    context: MqttContext,
    id: string,
  ): any {
    return (response: any) => {
      // 1. 附上原始请求 id
      Object.assign(response, { id });

      // 2. MqttRecord 类型的 data 可携带发布选项，需先取出再序列化
      const options =
        isObject(response?.data) && response.data instanceof MqttRecord
          ? (response.data as MqttRecord)?.options
          : {};
      delete response?.data?.options;

      // 3. 序列化并发布到 reply 主题
      const outgoingResponse: string | Buffer =
        this.serializer.serialize(response);

      this.onProcessingEndHook?.(this.transportId, context);
      return client.publish(
        this.getReplyPattern(context.getTopic()),
        outgoingResponse,
        options,
      );
    };
  }

  /**
   * 把 JSON 字符串解析为消息包，解析失败时原样返回。
   * @param content 原始消息内容
   * @returns 解析后的 ReadPacket 或原值
   */
  public parseMessage(content: any): ReadPacket & PacketId {
    try {
      return JSON.parse(content);
    } catch (e) {
      return content;
    }
  }

  /**
   * MQTT 通配符模式匹配：支持 `+`（单层通配）与 `#`（多层通配）。
   * @param pattern 订阅模式（如 "device/+/status"、"a/#"）
   * @param topic 实际消息 topic
   * @returns 是否匹配
   */
  public matchMqttPattern(pattern: string, topic: string) {
    // 1. 按 '/' 分段比较 pattern 与 topic
    const patternSegments = pattern.split(MQTT_SEPARATOR);
    const topicSegments = topic.split(MQTT_SEPARATOR);

    const patternSegmentsLength = patternSegments.length;
    const topicSegmentsLength = topicSegments.length;
    const lastIndex = patternSegmentsLength - 1;

    for (let i = 0; i < patternSegmentsLength; i++) {
      const currentPattern = patternSegments[i];
      const patternChar = currentPattern[0];
      const currentTopic = topicSegments[i];

      if (!currentTopic && !currentPattern) {
        continue;
      }
      if (!currentTopic && currentPattern !== MQTT_WILDCARD_ALL) {
        // 2. topic 段不足且 pattern 不是 # 通配：不匹配
        return false;
      }
      if (patternChar === MQTT_WILDCARD_ALL) {
        // 3. # 只能出现在最后一段，匹配剩余全部层级
        return i === lastIndex;
      }
      if (
        patternChar !== MQTT_WILDCARD_SINGLE &&
        currentPattern !== currentTopic
      ) {
        // 4. 普通段必须完全相等
        return false;
      }
    }
    return patternSegmentsLength === topicSegmentsLength;
  }

  /**
   * MQTT 覆盖版本的处理器查找：先按精确路由匹配，
   * 失败时遍历注册表逐个做通配符匹配（含共享订阅前缀剥离）。
   * @param pattern 收到消息的 topic
   * @returns 匹配到的处理器；未匹配时返回 null
   */
  public getHandlerByPattern(pattern: string): MessageHandler | null {
    // 1. 先尝试精确匹配
    const route = this.getRouteFromPattern(pattern);
    if (this.messageHandlers.has(route)) {
      return this.messageHandlers.get(route) || null;
    }

    // 2. 精确匹配失败：对每个注册的 pattern 做通配符匹配
    for (const [key, value] of this.messageHandlers) {
      const keyWithoutSharedPrefix = this.removeHandlerKeySharedPrefix(key);
      if (this.matchMqttPattern(keyWithoutSharedPrefix, route)) {
        return value;
      }
    }
    return null;
  }

  /**
   * 剥离 MQTT 共享订阅（shared subscription）的 `$share/{group}/` 前缀，
   * 以便剩余部分参与通配符匹配。
   * @param handlerKey 注册表中的 pattern 键
   * @returns 去除共享前缀后的 pattern
   */
  public removeHandlerKeySharedPrefix(handlerKey: string) {
    return handlerKey && handlerKey.startsWith('$share')
      ? handlerKey.split('/').slice(2).join('/')
      : handlerKey;
  }

  /**
   * 获取请求订阅使用的 topic（默认原样返回，供子类扩展）。
   * @param pattern 原始 pattern
   * @returns 订阅使用的 topic
   */
  public getRequestPattern(pattern: string): string {
    return pattern;
  }

  /**
   * 由请求 topic 推导响应 topic：追加 '/reply' 后缀。
   * @param pattern 请求 topic
   * @returns 响应 topic（{pattern}/reply）
   */
  public getReplyPattern(pattern: string): string {
    return `${pattern}/reply`;
  }

  /**
   * 注册「错误」事件监听器：记录错误日志。
   * @param client MQTT 客户端实例
   */
  public registerErrorListener(client: MqttClient) {
    client.on(MqttEventsMap.ERROR, (err: unknown) => this.logger.error(err));
  }

  /**
   * 注册「重连中」事件监听器：状态置为 RECONNECTING 并输出日志。
   * @param client MQTT 客户端实例
   */
  public registerReconnectListener(client: MqttClient) {
    client.on(MqttEventsMap.RECONNECT, () => {
      this._status$.next(MqttStatus.RECONNECTING);

      this.logger.log('MQTT connection lost. Trying to reconnect...');
    });
  }

  /**
   * 注册「断开」事件监听器：状态置为 DISCONNECTED。
   * @param client MQTT 客户端实例
   */
  public registerDisconnectListener(client: MqttClient) {
    client.on(MqttEventsMap.DISCONNECT, () => {
      this._status$.next(MqttStatus.DISCONNECTED);
    });
  }

  /**
   * 注册「关闭」事件监听器：状态置为 CLOSED。
   * @param client MQTT 客户端实例
   */
  public registerCloseListener(client: MqttClient) {
    client.on(MqttEventsMap.CLOSE, () => {
      this._status$.next(MqttStatus.CLOSED);
    });
  }

  /**
   * 注册「连接成功」事件监听器：状态置为 CONNECTED。
   * @param client MQTT 客户端实例
   */
  public registerConnectListener(client: MqttClient) {
    client.on(MqttEventsMap.CONNECT, () => {
      this._status$.next(MqttStatus.CONNECTED);
    });
  }

  /**
   * 暴露底层 mqtt 客户端实例。
   * @returns 底层客户端实例
   * @throws 未初始化时抛出错误
   */
  public unwrap<T>(): T {
    if (!this.mqttClient) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return this.mqttClient as T;
  }

  /**
   * 注册底层客户端事件监听器；客户端尚未创建时先暂存，
   * start() 完成后自动补注册。
   * @param event 事件名
   * @param callback 事件回调
   */
  public on<
    EventKey extends keyof MqttEvents = keyof MqttEvents,
    EventCallback extends MqttEvents[EventKey] = MqttEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.mqttClient) {
      this.mqttClient.on(event, callback as any);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  /**
   * 初始化 MQTT 专属序列化器（默认 MqttRecordSerializer，
   * 把数据序列化为字符串/Buffer 形式的消息负载）。
   * @param options MQTT 传输选项
   */
  protected initializeSerializer(options: MqttOptions['options']) {
    this.serializer = options?.serializer ?? new MqttRecordSerializer();
  }
}
