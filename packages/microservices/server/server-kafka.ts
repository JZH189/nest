import { Logger } from '@nestjs/common/services/logger.service';
import { isNil } from '@nestjs/common/utils/shared.utils';
import { isObservable, lastValueFrom, Observable, ReplaySubject } from 'rxjs';
import {
  KAFKA_DEFAULT_BROKER,
  KAFKA_DEFAULT_CLIENT,
  KAFKA_DEFAULT_GROUP,
  NO_EVENT_HANDLER,
  NO_MESSAGE_HANDLER,
} from '../constants';
import { KafkaContext } from '../ctx-host';
import { KafkaRequestDeserializer } from '../deserializers/kafka-request.deserializer';
import { KafkaHeaders, Transport } from '../enums';
import { KafkaStatus } from '../events';
import { KafkaRetriableException } from '../exceptions';
import {
  BrokersFunction,
  Consumer,
  ConsumerConfig,
  EachMessagePayload,
  Kafka,
  KafkaConfig,
  KafkaMessage,
  Message,
  Producer,
  RecordMetadata,
} from '../external/kafka.interface';
import { KafkaLogger, KafkaParser } from '../helpers';
import {
  KafkaOptions,
  OutgoingResponse,
  ReadPacket,
  TransportId,
} from '../interfaces';
import { KafkaRequestSerializer } from '../serializers/kafka-request.serializer';
import { Server } from './server';

let kafkaPackage: any = {};

/**
 * 基于 Kafka（kafkajs）的微服务服务端实现。
 *
 * 工作方式：
 * - Kafka 中没有传统「连接」，服务端表现为一个消费者组：把每个
 *   @MessagePattern/@EventPattern 的 pattern 当作 topic 订阅；
 * - 收到消息后从 headers 中取出 correlationId / replyTopic，
 *   据此区分 RPC 请求与事件请求；
 * - RPC 请求：执行处理器后向 replyTopic 生产响应消息，
 *   并在 headers 中回传 correlationId 供客户端匹配请求；
 * - 事件请求：走 handleEvent 分发，不回发响应。
 *
 * @publicApi
 */
export class ServerKafka extends Server<never, KafkaStatus> {
  /** 传输器唯一标识：KAFKA。 */
  public transportId: TransportId = Transport.KAFKA;

  /** 独立日志器（Kafka 日志会通过 KafkaLogger 桥接到这里）。 */
  protected logger = new Logger(ServerKafka.name);
  /** kafkajs 的 Kafka 客户端实例。 */
  protected client: Kafka | null = null;
  /** 消费者实例：订阅所有注册的 pattern（topic）。 */
  protected consumer: Consumer | null = null;
  /** 生产者实例：向 replyTopic 回发响应。 */
  protected producer: Producer | null = null;
  /** 消息解析器：把 kafkajs 原始消息解析为标准化的 KafkaMessage。 */
  protected parser: KafkaParser | null = null;
  /** broker 地址列表或返回地址列表的函数。 */
  protected brokers: string[] | BrokersFunction;
  /** Kafka 客户端 ID（自动追加后缀，避免与服务端客户端实例冲突）。 */
  protected clientId: string;
  /** 消费者组 ID（自动追加后缀，避免与客户端的消费者组冲突）。 */
  protected groupId: string;

  /**
   * @param options Kafka 传输选项，包括 client（KafkaConfig）、consumer、
   * producer、subscribe、run、send、postfixId、parser、序列化器/反序列化器等
   */
  constructor(protected readonly options: Required<KafkaOptions>['options']) {
    super();

    // 1. 读取 client/consumer 子配置与 clientId/groupId 后缀
    const clientOptions = this.getOptionsProp(
      this.options,
      'client',
      {} as KafkaConfig,
    );
    const consumerOptions = this.getOptionsProp(
      this.options,
      'consumer',
      {} as ConsumerConfig,
    );
    const postfixId = this.getOptionsProp(this.options, 'postfixId', '-server');

    this.brokers = clientOptions.brokers || [KAFKA_DEFAULT_BROKER];

    // Append a unique id to the clientId and groupId
    // so they don't collide with a microservices client
    // 2. 给 clientId/groupId 追加唯一后缀，避免与同进程的微服务客户端（ClientKafka）冲突
    this.clientId =
      (clientOptions.clientId || KAFKA_DEFAULT_CLIENT) + postfixId;
    this.groupId = (consumerOptions.groupId || KAFKA_DEFAULT_GROUP) + postfixId;

    // 3. 按需加载 kafkajs 依赖包
    kafkaPackage = this.loadPackage('kafkajs', ServerKafka.name, () =>
      require('kafkajs'),
    );

    // 4. 初始化消息解析器及序列化器/反序列化器（Kafka 有专属默认实现）
    this.parser = new KafkaParser((options && options.parser) || undefined);

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 启动 Kafka 服务端：创建客户端实例并连接消费者/生产者。
   * @param callback 启动完成或失败后调用的回调
   */
  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ): Promise<void> {
    try {
      // 1. 创建 kafkajs 客户端并启动消费者/生产者
      this.client = this.createClient();
      await this.start(callback);
    } catch (err) {
      // 2. 启动失败时把错误交给回调
      callback(err);
    }
  }

  /**
   * 关闭 Kafka 服务端：断开消费者与生产者连接并清空实例引用。
   */
  public async close(): Promise<void> {
    this.consumer && (await this.consumer.disconnect());
    this.producer && (await this.producer.disconnect());
    this.consumer = null;
    this.producer = null;
    this.client = null;
  }

  /**
   * 创建并连接消费者与生产者，随后把 pattern 订阅为 topic。
   * @param callback 启动完成后调用的回调
   */
  public async start(callback: () => void): Promise<void> {
    // 1. 使用配置的 consumer 选项（强制注入 groupId）创建消费者与生产者
    const consumerOptions = Object.assign(this.options.consumer || {}, {
      groupId: this.groupId,
    });
    this.consumer = this.client!.consumer(consumerOptions);
    this.producer = this.client!.producer(this.options.producer);
    // 2. 注册消费者/生产者的连接状态事件，驱动 status 可观察对象
    this.registerConsumerEventListeners();
    this.registerProducerEventListeners();

    // 3. 连接消费者与生产者，并把已注册的 pattern 作为 topic 订阅
    await this.consumer.connect();
    await this.producer.connect();
    await this.bindEvents(this.consumer);
    callback();
  }

  /**
   * 注册消费者事件监听器：把 CONNECT/DISCONNECT/REBALANCING/STOP/CRASH
   * 等底层事件映射到状态流（status）。
   */
  protected registerConsumerEventListeners() {
    if (!this.consumer) {
      return;
    }
    this.consumer.on(this.consumer.events.CONNECT, () =>
      this._status$.next(KafkaStatus.CONNECTED),
    );
    this.consumer.on(this.consumer.events.DISCONNECT, () =>
      this._status$.next(KafkaStatus.DISCONNECTED),
    );
    this.consumer.on(this.consumer.events.REBALANCING, () =>
      this._status$.next(KafkaStatus.REBALANCING),
    );
    this.consumer.on(this.consumer.events.STOP, () =>
      this._status$.next(KafkaStatus.STOPPED),
    );
    this.consumer.on(this.consumer.events.CRASH, () =>
      this._status$.next(KafkaStatus.CRASHED),
    );
  }

  /**
   * 注册生产者事件监听器：把 CONNECT/DISCONNECT 映射到状态流（status）。
   */
  protected registerProducerEventListeners() {
    if (!this.producer) {
      return;
    }
    this.producer.on(this.producer.events.CONNECT, () =>
      this._status$.next(KafkaStatus.CONNECTED),
    );
    this.producer.on(this.producer.events.DISCONNECT, () =>
      this._status$.next(KafkaStatus.DISCONNECTED),
    );
  }

  /**
   * 创建 kafkajs 客户端实例（自动注入 Nest 桥接的日志器）。
   * @returns Kafka 客户端实例
   */
  public createClient<T = any>(): T {
    return new kafkaPackage.Kafka(
      Object.assign(
        { logCreator: KafkaLogger.bind(null, this.logger) },
        this.options.client,
        { clientId: this.clientId, brokers: this.brokers },
      ) as KafkaConfig,
    );
  }

  /**
   * 把所有已注册的 pattern（作为 Kafka topic）订阅到消费者，
   * 并以 handleMessage 作为每条消息的处理函数启动消费。
   * @param consumer kafkajs 消费者实例
   */
  public async bindEvents(consumer: Consumer) {
    // 1. 收集所有注册的 pattern（即 topic 名称）与用户自定义订阅选项
    const registeredPatterns = [...this.messageHandlers.keys()];
    const consumerSubscribeOptions = this.options.subscribe || {};

    if (registeredPatterns.length > 0) {
      // 2. 批量订阅 topic；无任何 handler 时不订阅
      await this.consumer!.subscribe({
        ...consumerSubscribeOptions,
        topics: registeredPatterns,
      });
    }

    // 3. 以 handleMessage 作为 eachMessage 处理函数启动消费循环
    const consumerRunOptions = Object.assign(this.options.run || {}, {
      eachMessage: this.getMessageHandler(),
    });
    await consumer.run(consumerRunOptions);
  }

  /**
   * 返回传给 kafkajs eachMessage 的消息处理函数。
   * @returns 处理 EachMessagePayload 的异步函数
   */
  public getMessageHandler() {
    return async (payload: EachMessagePayload) => this.handleMessage(payload);
  }

  /**
   * 构造响应发布函数：把响应数据发送到请求头中指定的 replyTopic。
   * @param replyTopic 回发响应的目标 topic
   * @param replyPartition 回发响应的目标分区（可选）
   * @param correlationId 关联 ID，客户端据此匹配请求与响应
   * @param context Kafka 上下文
   * @returns 接收响应数据并执行发布的函数
   */
  public getPublisher(
    replyTopic: string,
    replyPartition: string,
    correlationId: string,
    context: KafkaContext,
  ): (data: any) => Promise<RecordMetadata[]> {
    return (data: any) =>
      this.sendMessage(
        data,
        replyTopic,
        replyPartition,
        correlationId,
        context,
      );
  }

  /**
   * 处理单条 Kafka 消息（核心分发逻辑）。
   * @param payload kafkajs 的每条消息负载（topic、partition、message）
   */
  public async handleMessage(payload: EachMessagePayload) {
    // 1. Kafka 中 topic 即消息模式（pattern），解析出原始消息并补充分区/主题信息
    const channel = payload.topic;
    const rawMessage = this.parser!.parse<KafkaMessage>(
      Object.assign(payload.message, {
        topic: payload.topic,
        partition: payload.partition,
      }),
    );
    // 2. 从消息头中读取关联 ID 与回发 topic/分区（客户端请求时写入）
    const headers = rawMessage.headers as unknown as Record<string, any>;
    const correlationId = headers[KafkaHeaders.CORRELATION_ID];
    const replyTopic = headers[KafkaHeaders.REPLY_TOPIC];
    const replyPartition = headers[KafkaHeaders.REPLY_PARTITION];

    // 3. 反序列化出 ReadPacket 并构造 Kafka 上下文（含消费者、生产者、心跳等）
    const packet = await this.deserializer.deserialize(rawMessage, { channel });
    const kafkaContext = new KafkaContext([
      rawMessage,
      payload.partition,
      payload.topic,
      this.consumer!,
      payload.heartbeat,
      this.producer!,
    ]);
    const handler = this.getHandlerByPattern(packet.pattern);
    // if the correlation id or reply topic is not set
    // then this is an event (events could still have correlation id)
    // 4. 缺少 correlationId/replyTopic 或本身是事件处理器：按事件分发，不回发响应
    if (handler?.isEventHandler || !correlationId || !replyTopic) {
      return this.handleEvent(packet.pattern, packet, kafkaContext);
    }

    // 5. RPC 请求：构造响应发布函数
    const publish = this.getPublisher(
      replyTopic,
      replyPartition,
      correlationId,
      kafkaContext,
    );

    if (!handler) {
      // 6. 未注册处理器：回发带 NO_MESSAGE_HANDLER 错误的响应
      return publish({
        id: correlationId,
        err: NO_MESSAGE_HANDLER,
      });
    }
    // 7. 执行处理器：结果统一转为 Observable，先把首值同步到 ReplaySubject
    //    （可重试异常会中断并抛出，交由 kafkajs 重新消费），再经 send() 发布响应
    return this.onProcessingStartHook(
      this.transportId,
      kafkaContext,
      async () => {
        const response$ = this.transformToObservable(
          handler(packet.data, kafkaContext),
        );

        const replayStream$ = new ReplaySubject();
        await this.combineStreamsAndThrowIfRetriable(response$, replayStream$);

        this.send(replayStream$, publish);
      },
    );
  }

  /**
   * 暴露底层 kafkajs 实例（[client, consumer, producer] 元组）。
   * @returns 底层实例数组
   * @throws 未初始化时抛出错误
   */
  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return [this.client, this.consumer, this.producer] as T;
  }

  /**
   * Kafka 服务端不支持注册通用事件监听器，调用即抛错。
   * @throws 始终抛出不支持错误
   */
  public on<
    EventKey extends string | number | symbol = string | number | symbol,
    EventCallback = any,
  >(event: EventKey, callback: EventCallback) {
    throw new Error('Method is not supported for Kafka server');
  }

  /**
   * 把响应流的所有值同步到 ReplaySubject，并在遇到可重试异常
   * （KafkaRetriableException）时抛出以触发 kafkajs 的消息重投递。
   * @param response$ 处理器响应流
   * @param replayStream$ 用于收集响应值的回放主体
   * @returns 首个值到达或流结束时 resolve 的 Promise
   */
  private combineStreamsAndThrowIfRetriable(
    response$: Observable<any>,
    replayStream$: ReplaySubject<unknown>,
  ) {
    return new Promise<void>((resolve, reject) => {
      let isPromiseResolved = false;
      response$.subscribe({
        // 1. 每个响应值写入回放主体，首个值到达即 resolve
        next: val => {
          replayStream$.next(val);
          if (!isPromiseResolved) {
            isPromiseResolved = true;
            resolve();
          }
        },
        // 2. 出错：可重试异常且尚未 resolve 时 reject（触发整条消息重新消费），
        //    其余错误照常向回放主体传递
        error: err => {
          if (err instanceof KafkaRetriableException && !isPromiseResolved) {
            isPromiseResolved = true;
            reject(err);
          } else {
            resolve();
          }
          replayStream$.error(err);
        },
        // 3. 流完成：同步关闭回放主体
        complete: () => replayStream$.complete(),
      });
    });
  }

  /**
   * 序列化并发送响应消息到 replyTopic（核心回发逻辑）。
   * @param message 待发送的响应包（含 response/err/isDisposed）
   * @param replyTopic 回发目标 topic
   * @param replyPartition 回发目标分区（可为空）
   * @param correlationId 关联 ID（写入响应头）
   * @param context Kafka 上下文
   * @returns broker 返回的记录元数据
   */
  public async sendMessage(
    message: OutgoingResponse,
    replyTopic: string,
    replyPartition: string | undefined | null,
    correlationId: string,
    context: KafkaContext,
  ): Promise<RecordMetadata[]> {
    // 1. 序列化响应数据
    const outgoingMessage = await this.serializer.serialize(message.response);
    // 2. 依次附加分区、关联 ID、错误标记、流结束标记等元信息
    this.assignReplyPartition(replyPartition, outgoingMessage);
    this.assignCorrelationIdHeader(correlationId, outgoingMessage);
    this.assignErrorHeader(message, outgoingMessage);
    this.assignIsDisposedHeader(message, outgoingMessage);

    // 3. 合并用户自定义 send 选项后由生产者发出，完成后触发结束钩子
    const replyMessage = Object.assign(
      {
        topic: replyTopic,
        messages: [outgoingMessage],
      },
      this.options.send || {},
    );
    return this.producer!.send(replyMessage).finally(() => {
      this.onProcessingEndHook?.(this.transportId, context);
    });
  }

  /**
   * 响应流已结束时，在响应头中写入 NEST_IS_DISPOSED 标记（客户端据此停止等待）。
   * @param outgoingResponse 响应包
   * @param outgoingMessage 待发送的 Kafka 消息
   */
  public assignIsDisposedHeader(
    outgoingResponse: OutgoingResponse,
    outgoingMessage: Message,
  ) {
    if (!outgoingResponse.isDisposed) {
      return;
    }
    outgoingMessage.headers![KafkaHeaders.NEST_IS_DISPOSED] = Buffer.alloc(1);
  }

  /**
   * 响应包含错误时，在响应头中写入序列化后的 NEST_ERR 错误信息。
   * @param outgoingResponse 响应包
   * @param outgoingMessage 待发送的 Kafka 消息
   */
  public assignErrorHeader(
    outgoingResponse: OutgoingResponse,
    outgoingMessage: Message,
  ) {
    if (!outgoingResponse.err) {
      return;
    }
    const stringifiedError =
      typeof outgoingResponse.err === 'object'
        ? JSON.stringify(outgoingResponse.err)
        : outgoingResponse.err;
    outgoingMessage.headers![KafkaHeaders.NEST_ERR] =
      Buffer.from(stringifiedError);
  }

  /**
   * 把关联 ID 写入响应头（客户端据此将响应与请求配对）。
   * @param correlationId 关联 ID
   * @param outgoingMessage 待发送的 Kafka 消息
   */
  public assignCorrelationIdHeader(
    correlationId: string,
    outgoingMessage: Message,
  ) {
    outgoingMessage.headers![KafkaHeaders.CORRELATION_ID] =
      Buffer.from(correlationId);
  }

  /**
   * 指定响应的目标分区（请求头 replyPartition 非空时才设置）。
   * @param replyPartition 回发目标分区
   * @param outgoingMessage 待发送的 Kafka 消息
   */
  public assignReplyPartition(
    replyPartition: string | null | undefined,
    outgoingMessage: Message,
  ) {
    if (isNil(replyPartition)) {
      return;
    }
    outgoingMessage.partition = parseFloat(replyPartition);
  }

  /**
   * Kafka 版本的事件处理：与基类不同，这里会等待事件处理器返回的
   * Observable 完成（lastValueFrom），确保处理结束后再触发结束钩子。
   * @param pattern 消息模式
   * @param packet 入站消息包
   * @param context Kafka 上下文
   */
  public async handleEvent(
    pattern: string,
    packet: ReadPacket,
    context: KafkaContext,
  ): Promise<any> {
    // 1. 查找事件处理器，未找到时记录错误
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      return this.logger.error(NO_EVENT_HANDLER`${pattern}`);
    }

    // 2. 在开始钩子内执行处理器；返回 Observable 时等待其完成
    return this.onProcessingStartHook(this.transportId, context, async () => {
      const resultOrStream = await handler(packet.data, context);
      if (isObservable(resultOrStream)) {
        await lastValueFrom(resultOrStream);
        this.onProcessingEndHook?.(this.transportId, context);
      }
    });
  }

  /**
   * 初始化 Kafka 专属序列化器（默认 KafkaRequestSerializer，
   * 把数据序列化为 Kafka 消息的 value 与 headers）。
   * @param options Kafka 传输选项
   */
  protected initializeSerializer(options: KafkaOptions['options']) {
    this.serializer =
      (options && options.serializer) || new KafkaRequestSerializer();
  }

  /**
   * 初始化 Kafka 专属反序列化器（默认 KafkaRequestDeserializer，
   * 从消息 value/headers 中解析出 pattern 与 data）。
   * @param options Kafka 传输选项
   */
  protected initializeDeserializer(options: KafkaOptions['options']) {
    this.deserializer = options?.deserializer ?? new KafkaRequestDeserializer();
  }
}
