import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isNil, isUndefined } from '@nestjs/common/utils/shared.utils';
import {
  throwError as _throw,
  connectable,
  defer,
  Observable,
  Subject,
} from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import {
  KAFKA_DEFAULT_BROKER,
  KAFKA_DEFAULT_CLIENT,
  KAFKA_DEFAULT_GROUP,
} from '../constants';
import { KafkaResponseDeserializer } from '../deserializers/kafka-response.deserializer';
import { KafkaHeaders } from '../enums';
import { InvalidKafkaClientTopicException } from '../errors/invalid-kafka-client-topic.exception';
import { InvalidMessageException } from '../errors/invalid-message.exception';
import { KafkaStatus } from '../events';
import {
  BrokersFunction,
  Consumer,
  ConsumerConfig,
  ConsumerGroupJoinEvent,
  EachMessagePayload,
  Kafka,
  KafkaConfig,
  KafkaMessage,
  Producer,
  TopicPartitionOffsetAndMetadata,
} from '../external/kafka.interface';
import {
  KafkaLogger,
  KafkaParser,
  KafkaReplyPartitionAssigner,
} from '../helpers';
import {
  ClientKafkaProxy,
  KafkaOptions,
  MsPattern,
  OutgoingEvent,
  ReadPacket,
  WritePacket,
} from '../interfaces';
import {
  KafkaRequest,
  KafkaRequestSerializer,
} from '../serializers/kafka-request.serializer';
import { ClientProxy } from './client-proxy';

let kafkaPackage: any = {};

/**
 * 基于 Kafka（kafkajs）的客户端实现（ClientProxy 的子类）。
 * 请求-响应式通信依赖“回复主题（reply topic）”机制：
 * 请求消息头中携带 CORRELATION_ID / REPLY_TOPIC / REPLY_PARTITION，
 * 客户端预先订阅 `{pattern}.reply` 主题，消费响应后按 correlation id 匹配回调。
 * 事件式通信则直接向 pattern 对应的 topic 生产消息。
 * 依赖 kafkajs 包，首次使用时才动态加载。
 *
 * @publicApi
 */
export class ClientKafka
  extends ClientProxy<never, KafkaStatus>
  implements ClientKafkaProxy
{
  protected logger = new Logger(ClientKafka.name);
  /** kafkajs Kafka 实例（未连接时为 null） */
  protected client: Kafka | null = null;
  /** Kafka 消息解析器（原始 KafkaMessage -> ReadPacket） */
  protected parser: KafkaParser | null = null;
  /** 复用中的初始化 Promise（保证并发 connect 只初始化一次） */
  protected initialized: Promise<void> | null = null;
  /** 需要订阅的回复主题列表（通过 subscribeToResponseOf 添加） */
  protected responsePatterns: string[] = [];
  /** 消费组对各 topic 分配到的最小分区号（用于确定 reply partition） */
  protected consumerAssignments: { [key: string]: number } = {};
  /** broker 地址列表或获取函数 */
  protected brokers: string[] | BrokersFunction;
  /** Kafka 客户端 ID */
  protected clientId: string;
  /** 消费组 ID */
  protected groupId: string;
  /** 是否仅生产者模式（不创建 consumer，只 emit 不 send） */
  protected producerOnlyMode: boolean;
  /** 消费者实例 */
  protected _consumer: Consumer | null = null;
  /** 生产者实例 */
  protected _producer: Producer | null = null;

  /**
   * 获取消费者实例（未初始化时抛出错误）。
   */
  get consumer(): Consumer {
    if (!this._consumer) {
      throw new Error(
        'No consumer initialized. Please, call the "connect" method first.',
      );
    }
    return this._consumer;
  }

  /**
   * 获取生产者实例（未初始化时抛出错误）。
   */
  get producer(): Producer {
    if (!this._producer) {
      throw new Error(
        'No producer initialized. Please, call the "connect" method first.',
      );
    }
    return this._producer;
  }

  /**
   * @param options - Kafka 客户端选项（client/consumer/producer/subscribe/run、postfixId、producerOnlyMode 等）
   */
  constructor(protected readonly options: Required<KafkaOptions>['options']) {
    super();

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
    const postfixId = this.getOptionsProp(this.options, 'postfixId', '-client');
    this.producerOnlyMode = this.getOptionsProp(
      this.options,
      'producerOnlyMode',
      false,
    );

    this.brokers = clientOptions.brokers || [KAFKA_DEFAULT_BROKER];

    // Append a unique id to the clientId and groupId
    // so they don't collide with a microservices client
    this.clientId =
      (clientOptions.clientId || KAFKA_DEFAULT_CLIENT) + postfixId;
    this.groupId = (consumerOptions.groupId || KAFKA_DEFAULT_GROUP) + postfixId;

    kafkaPackage = loadPackage('kafkajs', ClientKafka.name, () =>
      require('kafkajs'),
    );

    this.parser = new KafkaParser((options && options.parser) || undefined);

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 订阅某个请求模式的响应主题（`pattern.reply`），
   * 使用 send() 前必须为每个 pattern 调用此方法。
   * @param pattern - 请求模式
   */
  public subscribeToResponseOf(pattern: unknown): void {
    const request = this.normalizePattern(pattern as MsPattern);
    this.responsePatterns.push(this.getResponsePatternName(request));
  }

  /**
   * 断开生产者与消费者并清空所有引用。
   */
  public async close(): Promise<void> {
    this._producer && (await this._producer.disconnect());
    this._consumer && (await this._consumer.disconnect());
    this._producer = null;
    this._consumer = null;
    this.initialized = null;
    this.client = null;
  }

  /**
   * 连接 Kafka（创建 client、consumer、producer），流程：
   * 1. 已初始化则直接复用 Promise；
   * 2. 创建 Kafka 客户端；非仅生产者模式时，配置 KafkaReplyPartitionAssigner 作为分区分配器，
   *    创建 consumer 并注册事件监听器（状态流 + GROUP_JOIN 时记录分区分配）；
   * 3. 连接 consumer 并 bindTopics()（订阅回复主题并开始消费）；
   * 4. 创建并连接 producer，注册其事件监听器，初始化完成。
   * @returns 生产者实例的 Promise
   */
  public async connect(): Promise<Producer> {
    if (this.initialized) {
      return this.initialized.then(() => this._producer!);
    }
    /* eslint-disable-next-line no-async-promise-executor */
    this.initialized = new Promise(async (resolve, reject) => {
      try {
        this.client = this.createClient();
        if (!this.producerOnlyMode) {
          const partitionAssigners = [
            (
              config: ConstructorParameters<
                typeof KafkaReplyPartitionAssigner
              >[1],
            ) => new KafkaReplyPartitionAssigner(this, config),
          ];

          const consumerOptions = Object.assign(
            {
              partitionAssigners,
            },
            this.options.consumer || {},
            {
              groupId: this.groupId,
            },
          );

          this._consumer = this.client!.consumer(consumerOptions);
          this.registerConsumerEventListeners();

          // Set member assignments on join and rebalance
          this._consumer.on(
            this._consumer.events.GROUP_JOIN,
            this.setConsumerAssignments.bind(this),
          );
          await this._consumer.connect();
          await this.bindTopics();
        }

        this._producer = this.client!.producer(this.options.producer || {});
        this.registerProducerEventListeners();
        await this._producer.connect();

        resolve();
      } catch (err) {
        reject(err);
      }
    });
    return this.initialized.then(() => this._producer!);
  }

  /**
   * 绑定回复主题：为 subscribeToResponseOf 登记的所有回复主题创建订阅，
   * 然后以 createResponseCallback 作为 eachMessage 处理器启动消费循环。
   */
  public async bindTopics(): Promise<void> {
    if (!this._consumer) {
      throw Error('No consumer initialized');
    }

    const consumerSubscribeOptions = this.options.subscribe || {};

    if (this.responsePatterns.length > 0) {
      await this._consumer.subscribe({
        ...consumerSubscribeOptions,
        topics: this.responsePatterns,
      });
    }

    await this._consumer.run(
      Object.assign(this.options.run || {}, {
        eachMessage: this.createResponseCallback(),
      }),
    );
  }

  /**
   * 创建 kafkajs Kafka 客户端：合并日志创建器、用户 client 配置、brokers 与 clientId。
   * @returns Kafka 客户端实例
   */
  public createClient<T = any>(): T {
    const kafkaConfig: KafkaConfig = Object.assign(
      { logCreator: KafkaLogger.bind(null, this.logger) },
      this.options.client,
      { brokers: this.brokers, clientId: this.clientId },
    );

    return new kafkaPackage.Kafka(kafkaConfig);
  }

  /**
   * 创建回复消息的消费回调：
   * 1. 用 parser 解析原始消息（附上 topic/partition）；
   * 2. 无 CORRELATION_ID 头的消息直接忽略（非本客户端的响应）；
   * 3. 反序列化后按 id 从 routingMap 匹配回调并触发，err/isDisposed 时结束对应 Observable。
   * @returns eachMessage 消费回调
   */
  public createResponseCallback(): (payload: EachMessagePayload) => any {
    return async (payload: EachMessagePayload) => {
      const rawMessage = this.parser!.parse<KafkaMessage>(
        Object.assign(payload.message, {
          topic: payload.topic,
          partition: payload.partition,
        }),
      );
      if (isUndefined(rawMessage.headers![KafkaHeaders.CORRELATION_ID])) {
        return;
      }
      const { err, response, isDisposed, id } =
        await this.deserializer.deserialize(rawMessage);
      const callback = this.routingMap.get(id);
      if (!callback) {
        return;
      }
      if (err || isDisposed) {
        return callback({
          err,
          response,
          isDisposed,
        });
      }
      callback({
        err,
        response,
      });
    };
  }

  /**
   * 获取消费组分区分配信息（topic -> 最小分区号）。
   * @returns consumerAssignments 映射
   */
  public getConsumerAssignments() {
    return this.consumerAssignments;
  }

  /**
   * 批量发射事件：向同一 topic（pattern）一次性发送多条消息。
   * 与 emit() 类似：先懒连接，再调用 dispatchBatchEvent，并以热 Observable 缓存结果。
   * @param pattern - 目标主题（模式）
   * @param data - 包含 messages 数组的数据
   * @returns 发送完成后即完成的 Observable
   */
  public emitBatch<TResult = any, TInput = any>(
    pattern: any,
    data: { messages: TInput[] },
  ): Observable<TResult> {
    if (isNil(pattern) || isNil(data)) {
      return _throw(() => new InvalidMessageException());
    }
    const source = defer(async () => this.connect()).pipe(
      mergeMap(() => this.dispatchBatchEvent({ pattern, data })),
    );
    const connectableSource = connectable(source, {
      connector: () => new Subject(),
      resetOnDisconnect: false,
    });
    connectableSource.connect();
    return connectableSource;
  }

  /**
   * 手动提交指定 topic/分区的偏移量（需已初始化 consumer）。
   * @param topicPartitions - 待提交的分区偏移量列表
   */
  public commitOffsets(
    topicPartitions: TopicPartitionOffsetAndMetadata[],
  ): Promise<void> {
    if (this._consumer) {
      return this._consumer.commitOffsets(topicPartitions);
    } else {
      throw new Error('No consumer initialized');
    }
  }

  /**
   * 获取底层 kafkajs Kafka 客户端实例。
   * @returns Kafka 客户端实例（未连接时抛出错误）
   */
  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "connect" method first.',
      );
    }
    return this.client as T;
  }

  /**
   * Kafka 客户端不支持 on() 事件监听，调用即抛错。
   */
  public on<
    EventKey extends string | number | symbol = string | number | symbol,
    EventCallback = any,
  >(event: EventKey, callback: EventCallback) {
    throw new Error('Method is not supported for Kafka client');
  }

  /**
   * 注册消费者事件监听器：把 CONNECT/DISCONNECT/REBALANCING/STOP/CRASH
   * 事件映射为 KafkaStatus 推送到状态流。
   */
  protected registerConsumerEventListeners() {
    if (!this._consumer) {
      return;
    }
    this._consumer.on(this._consumer.events.CONNECT, () =>
      this._status$.next(KafkaStatus.CONNECTED),
    );
    this._consumer.on(this._consumer.events.DISCONNECT, () =>
      this._status$.next(KafkaStatus.DISCONNECTED),
    );
    this._consumer.on(this._consumer.events.REBALANCING, () =>
      this._status$.next(KafkaStatus.REBALANCING),
    );
    this._consumer.on(this._consumer.events.STOP, () =>
      this._status$.next(KafkaStatus.STOPPED),
    );
    this._consumer.on(this._consumer.events.CRASH, () =>
      this._status$.next(KafkaStatus.CRASHED),
    );
  }

  /**
   * 注册生产者事件监听器：把 CONNECT/DISCONNECT 事件映射为 KafkaStatus 推送到状态流。
   */
  protected registerProducerEventListeners() {
    if (!this._producer) {
      return;
    }
    this._producer.on(this._producer.events.CONNECT, () =>
      this._status$.next(KafkaStatus.CONNECTED),
    );
    this._producer.on(this._producer.events.DISCONNECT, () =>
      this._status$.next(KafkaStatus.DISCONNECTED),
    );
  }

  /**
   * 批量发送事件：逐条序列化消息后合并 options.send 配置，调用 producer.send 一次发出。
   * @param packets - 事件包（data.messages 为消息数组）
   * @returns producer.send 的结果
   */
  protected async dispatchBatchEvent<TInput = any>(
    packets: ReadPacket<{ messages: TInput[] }>,
  ): Promise<any> {
    if (packets.data.messages.length === 0) {
      return;
    }
    const pattern = this.normalizePattern(packets.pattern);
    const outgoingEvents = await Promise.all(
      packets.data.messages.map(message => {
        return this.serializer.serialize(message as any, { pattern });
      }),
    );

    const message = Object.assign(
      {
        topic: pattern,
        messages: outgoingEvents,
      },
      this.options.send || {},
    );

    return this.producer.send(message);
  }

  /**
   * 发送事件（不等待响应）：规范化 pattern 作为 topic，序列化数据为一条消息后由 producer 发送。
   * @param packet - 事件包
   * @returns producer.send 的结果
   */
  protected async dispatchEvent(packet: OutgoingEvent): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const outgoingEvent = await this.serializer.serialize(packet.data, {
      pattern,
    });
    const message = Object.assign(
      {
        topic: pattern,
        messages: [outgoingEvent],
      },
      this.options.send || {},
    );

    return this._producer!.send(message);
  }

  /**
   * 获取回复主题应投递到的分区号：取消费组在该 topic 上分配到的最小分区。
   * 未订阅该 topic（无分配信息）时抛出 InvalidKafkaClientTopicException。
   * @param topic - 回复主题名
   * @returns 分区号字符串
   */
  protected getReplyTopicPartition(topic: string): string {
    const minimumPartition = this.consumerAssignments[topic];
    if (isUndefined(minimumPartition)) {
      throw new InvalidKafkaClientTopicException(topic);
    }

    // Get the minimum partition
    return minimumPartition.toString();
  }

  /**
   * 发布（请求-响应式）消息到 Kafka，流程：
   * 1. 分配唯一 id，登记 id -> 回调 到 routingMap；
   * 2. 规范化 pattern，计算回复主题（pattern.reply）与回复分区；
   * 3. 序列化消息，并在 headers 中写入 CORRELATION_ID / REPLY_TOPIC / REPLY_PARTITION；
   * 4. 由 producer 发送到请求 topic；发送失败时清理并回调错误；
   * 5. 返回清理函数（删除路由映射）。
   * @param partialPacket - 请求包
   * @param callback - 响应回调
   * @returns 取消订阅的清理函数
   */
  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    const packet = this.assignPacketId(partialPacket);
    this.routingMap.set(packet.id, callback);

    const cleanup = () => this.routingMap.delete(packet.id);
    const errorCallback = (err: unknown) => {
      cleanup();
      callback({ err });
    };

    try {
      const pattern = this.normalizePattern(partialPacket.pattern);
      const replyTopic = this.getResponsePatternName(pattern);
      const replyPartition = this.getReplyTopicPartition(replyTopic);

      Promise.resolve(this.serializer.serialize(packet.data, { pattern }))
        .then((serializedPacket: KafkaRequest) => {
          serializedPacket.headers[KafkaHeaders.CORRELATION_ID] = packet.id;
          serializedPacket.headers[KafkaHeaders.REPLY_TOPIC] = replyTopic;
          serializedPacket.headers[KafkaHeaders.REPLY_PARTITION] =
            replyPartition;

          const message = Object.assign(
            {
              topic: pattern,
              messages: [serializedPacket],
            },
            this.options.send || {},
          );

          return this._producer!.send(message);
        })
        .catch(err => errorCallback(err));

      return cleanup;
    } catch (err) {
      errorCallback(err);
      return () => null;
    }
  }

  /**
   * 生成回复主题名：在请求模式后追加 ".reply"。
   * @param pattern - 规范化后的请求模式
   * @returns 回复主题名
   */
  protected getResponsePatternName(pattern: string): string {
    return `${pattern}.reply`;
  }

  /**
   * 消费组加入（GROUP_JOIN）后记录分区分配：仅保留每个 topic 的最小分区号。
   * @param data - 消费组加入事件（含成员分配信息）
   */
  protected setConsumerAssignments(data: ConsumerGroupJoinEvent): void {
    const consumerAssignments: { [key: string]: number } = {};

    // Only need to set the minimum
    Object.keys(data.payload.memberAssignment).forEach(topic => {
      const memberPartitions = data.payload.memberAssignment[topic];

      if (memberPartitions.length) {
        consumerAssignments[topic] = Math.min(...memberPartitions);
      }
    });

    this.consumerAssignments = consumerAssignments;
  }

  /**
   * 初始化序列化器：优先使用 options.serializer，否则默认 KafkaRequestSerializer。
   * @param options - Kafka 客户端选项
   */
  protected initializeSerializer(options: KafkaOptions['options']) {
    this.serializer =
      (options && options.serializer) || new KafkaRequestSerializer();
  }

  /**
   * 初始化反序列化器：优先使用 options.deserializer，否则默认 KafkaResponseDeserializer。
   * @param options - Kafka 客户端选项
   */
  protected initializeDeserializer(options: KafkaOptions['options']) {
    this.deserializer =
      (options && options.deserializer) || new KafkaResponseDeserializer();
  }
}
