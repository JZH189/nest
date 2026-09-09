/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { isFunction, isString } from '@nestjs/common/utils/shared.utils';
import { EventEmitter } from 'events';
import {
  EmptyError,
  firstValueFrom,
  fromEvent,
  merge,
  Observable,
  ReplaySubject,
} from 'rxjs';
import { first, map, retryWhen, scan, skip, switchMap } from 'rxjs/operators';
import {
  BLOCKED_RMQ_MESSAGE,
  DISCONNECTED_RMQ_MESSAGE,
  RQM_DEFAULT_IS_GLOBAL_PREFETCH_COUNT,
  RQM_DEFAULT_NO_ASSERT,
  RQM_DEFAULT_NOACK,
  RQM_DEFAULT_PERSISTENT,
  RQM_DEFAULT_PREFETCH_COUNT,
  RQM_DEFAULT_QUEUE,
  RQM_DEFAULT_QUEUE_OPTIONS,
  RQM_DEFAULT_URL,
  UNBLOCKED_RMQ_MESSAGE,
} from '../constants';
import { RmqEvents, RmqEventsMap, RmqStatus } from '../events/rmq.events';
import { ReadPacket, RmqOptions, WritePacket } from '../interfaces';
import { RmqRecord } from '../record-builders';
import { RmqRecordSerializer } from '../serializers/rmq-record.serializer';
import { ClientProxy } from './client-proxy';

// To enable type safety for RMQ. This cant be uncommented by default
// because it would require the user to install the amqplib package even if they dont use RabbitMQ
// Otherwise, TypeScript would fail to compile the code.
//
// type AmqpConnectionManager =
//   import('amqp-connection-manager').AmqpConnectionManager;
// type ChannelWrapper = import('amqp-connection-manager').ChannelWrapper;
// type Channel = import('amqplib').Channel;
// type ConsumeMessage = import('amqplib').ConsumeMessage;

type Channel = any;
type ChannelWrapper = any;
type ConsumeMessage = any;
type AmqpConnectionManager = any;

let rmqPackage = {} as any; // typeof import('amqp-connection-manager');

const REPLY_QUEUE = 'amq.rabbitmq.reply-to';

/**
 * 基于 RabbitMQ（amqp-connection-manager + amqplib）的客户端实现（ClientProxy 的子类）。
 * 请求-响应通过 Direct Reply-To（amq.rabbitmq.reply-to 伪队列）与 correlationId 匹配实现；
 * 支持 exchange/fanout/wildcards 路由模式。内置连接管理器的自动重连能力。
 * 依赖 amqplib 与 amqp-connection-manager 包，首次使用时动态加载。
 *
 * @publicApi
 */
export class ClientRMQ extends ClientProxy<RmqEvents, RmqStatus> {
  protected readonly logger = new Logger(ClientProxy.name);
  /** 连接状态重放主题（供 convertConnectionToPromise 使用） */
  protected connection$: ReplaySubject<any>;
  /** 复用中的连接 Promise */
  protected connectionPromise: Promise<void>;
  /** amqp 连接管理器实例（负责自动重连） */
  protected client: AmqpConnectionManager | null = null;
  /** 通道包装器实例 */
  protected channel: ChannelWrapper | null = null;
  /** 连接建立前注册的事件监听器缓存 */
  protected pendingEventListeners: Array<{
    event: keyof RmqEvents;
    callback: RmqEvents[keyof RmqEvents];
  }> = [];
  /** 是否为首次连接（首次连接后创建 channel） */
  protected isInitialConnect = true;
  /** 响应分发器：correlationId -> 响应监听器 */
  protected responseEmitter: EventEmitter;
  /** 目标队列名 */
  protected queue: string;
  /** 队列声明选项 */
  protected queueOptions: Record<string, any>;
  /** 回复队列（默认 Direct Reply-To 伪队列） */
  protected replyQueue: string;
  /** 是否跳过队列断言（assert） */
  protected noAssert: boolean;

  /**
   * @param options - RMQ 客户端选项（queue、urls、exchange、routingKey、wildcards 等）
   */
  constructor(protected readonly options: Required<RmqOptions>['options']) {
    super();
    this.queue = this.getOptionsProp(this.options, 'queue', RQM_DEFAULT_QUEUE);
    this.queueOptions = this.getOptionsProp(
      this.options,
      'queueOptions',
      RQM_DEFAULT_QUEUE_OPTIONS,
    );
    this.replyQueue = this.getOptionsProp(
      this.options,
      'replyQueue',
      REPLY_QUEUE,
    );
    this.noAssert =
      this.getOptionsProp(this.options, 'noAssert') ??
      this.queueOptions.noAssert ??
      RQM_DEFAULT_NO_ASSERT;

    loadPackage('amqplib', ClientRMQ.name, () => require('amqplib'));
    rmqPackage = loadPackage('amqp-connection-manager', ClientRMQ.name, () =>
      require('amqp-connection-manager'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 关闭通道与连接管理器并清理状态与缓存监听器。
   */
  public async close(): Promise<void> {
    this.channel && (await this.channel.close());
    this.client && (await this.client.close());
    this.channel = null;
    this.client = null;
    this.pendingEventListeners = [];
  }

  /**
   * 连接 RabbitMQ，流程：
   * 1. 已有连接管理器则复用 connectionPromise；
   * 2. 创建连接管理器并注册错误/断开/连接/阻塞/解除阻塞五类监听器；
   * 3. 补挂缓存的监听器，创建响应分发器（不限制监听器数量）；
   * 4. 组装连接流：连接/断开事件触发后创建 channel；重连事件（跳过首次）并入同一流；
   * 5. 将流写入 ReplaySubject 并转为 connectionPromise 返回。
   * @returns 连接完成的 Promise
   */
  public connect(): Promise<any> {
    if (this.client) {
      return this.connectionPromise;
    }
    this.client = this.createClient();

    this.registerErrorListener(this.client);
    this.registerDisconnectListener(this.client);
    this.registerConnectListener(this.client);
    this.registerBlockedListener(this.client);
    this.registerUnblockedListener(this.client);
    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.client!.on(event, callback),
    );
    this.pendingEventListeners = [];

    this.responseEmitter = new EventEmitter();
    this.responseEmitter.setMaxListeners(0);

    const connect$ = this.connect$(this.client);
    const withDisconnect$ = this.mergeDisconnectEvent(
      this.client,
      connect$,
    ).pipe(switchMap(() => this.createChannel()));

    const withReconnect$ = fromEvent(this.client, RmqEventsMap.CONNECT).pipe(
      skip(1),
    );
    const source$ = merge(withDisconnect$, withReconnect$);

    this.connection$ = new ReplaySubject(1);
    source$.subscribe(this.connection$);
    this.connectionPromise = this.convertConnectionToPromise();

    return this.connectionPromise;
  }

  /**
   * 创建通道：json 模式关闭（自行序列化），
   * setup 回调中完成队列/交换机声明、prefetch 与消费订阅，完成后 resolve。
   * @returns 通道建立完成的 Promise
   */
  public createChannel(): Promise<void> {
    return new Promise(resolve => {
      this.channel = this.client!.createChannel({
        json: false,
        setup: (channel: Channel) => this.setupChannel(channel, resolve),
      });
    });
  }

  /**
   * 创建 amqp 连接管理器：合并 urls 与 socketOptions。
   * @returns 连接管理器实例
   */
  public createClient(): AmqpConnectionManager {
    const socketOptions = this.getOptionsProp(this.options, 'socketOptions');
    const urls = this.getOptionsProp(this.options, 'urls') || [RQM_DEFAULT_URL];
    return rmqPackage.connect(urls, socketOptions);
  }

  /**
   * 把 disconnect / connectFailed 事件并入连接流（转为错误）：
   * connectFailed 会在遍历完所有 urls 后才真正抛错；最终流取第一个事件即完成。
   * @param instance - 连接管理器实例
   * @param source$ - 原连接流
   * @returns 合并后的连接流
   */
  public mergeDisconnectEvent<T = any>(
    instance: any,
    source$: Observable<T>,
  ): Observable<T> {
    const eventToError = (eventType: string) =>
      fromEvent(instance, eventType).pipe(
        map((err: unknown) => {
          throw err;
        }),
      );
    const disconnect$ = eventToError(RmqEventsMap.DISCONNECT);

    const urls = this.getOptionsProp(this.options, 'urls', []);
    const connectFailedEventKey = 'connectFailed';
    const connectFailed$ = eventToError(connectFailedEventKey).pipe(
      retryWhen(e =>
        e.pipe(
          scan((errorCount, error: any) => {
            if (urls.indexOf(error.url) >= urls.length - 1) {
              throw error;
            }
            return errorCount + 1;
          }, 0),
        ),
      ),
    );
    // If we ever decide to propagate all disconnect errors & re-emit them through
    // the "connection" stream then comment out "first()" operator.
    return merge(source$, disconnect$, connectFailed$).pipe(first());
  }

  /**
   * 等待 connection$ 的第一个值（连接结果），EmptyError 视为正常结束。
   * @returns 连接完成的 Promise
   */
  public async convertConnectionToPromise() {
    try {
      return await firstValueFrom(this.connection$);
    } catch (err) {
      if (err instanceof EmptyError) {
        return;
      }
      throw err;
    }
  }

  /**
   * 设置通道，流程：
   * 1. 读取 prefetchCount 与 isGlobalPrefetchCount 配置；
   * 2. 非 wildcards/fanout 模式：声明队列（除非 noAssert），并按需绑定 exchange；
   * 3. wildcards 或 fanout 模式：改为声明 durable 的 exchange（topic 或 fanout 类型）；
   * 4. 设置 prefetch，并启动对回复队列的消费，最后 resolve 连接 Promise。
   * @param channel - amqp 原始通道
   * @param resolve - 通道建立完成后调用的 resolve 函数
   */
  public async setupChannel(channel: Channel, resolve: Function) {
    const prefetchCount =
      this.getOptionsProp(this.options, 'prefetchCount') ||
      RQM_DEFAULT_PREFETCH_COUNT;
    const isGlobalPrefetchCount =
      this.getOptionsProp(this.options, 'isGlobalPrefetchCount') ||
      RQM_DEFAULT_IS_GLOBAL_PREFETCH_COUNT;

    if (!this.options.wildcards && this.options.exchangeType !== 'fanout') {
      if (!this.noAssert) {
        await channel.assertQueue(this.queue, this.queueOptions);
      }

      if (this.options.exchange && this.options.routingKey) {
        await channel.bindQueue(
          this.queue,
          this.options.exchange,
          this.options.exchangeType === 'fanout' ? '' : this.options.routingKey,
        );
      }
    } else {
      const exchange = this.getOptionsProp(
        this.options,
        'exchange',
        this.options.queue,
      );
      const exchangeType = this.getOptionsProp(
        this.options,
        'exchangeType',
        'topic',
      );
      await channel.assertExchange(exchange, exchangeType, {
        durable: true,
        arguments: this.getOptionsProp(this.options, 'exchangeArguments', {}),
      });
    }

    await channel.prefetch(prefetchCount, isGlobalPrefetchCount);
    await this.consumeChannel(channel);
    resolve();
  }

  /**
   * 订阅回复队列：收到响应时以 correlationId 为事件名在 responseEmitter 上分发消息
   * （publish 中注册的监听器按 correlationId 匹配消费）。
   * @param channel - amqp 原始通道
   */
  public async consumeChannel(channel: Channel) {
    const noAck = this.getOptionsProp(this.options, 'noAck', RQM_DEFAULT_NOACK);
    await channel.consume(
      this.replyQueue,
      (msg: ConsumeMessage | null) =>
        this.responseEmitter.emit(msg!.properties.correlationId, msg),
      {
        noAck,
      },
    );
  }

  /**
   * 注册错误监听器：记录错误日志。
   * @param client - 连接管理器实例
   */
  public registerErrorListener(client: AmqpConnectionManager): void {
    client.addListener(RmqEventsMap.ERROR, (err: any) =>
      this.logger.error(err),
    );
  }

  /**
   * 注册断开监听器：推送 DISCONNECTED 状态；非首次连接时置空 connectionPromise
   * （等待重连），并打印断开日志。
   * @param client - 连接管理器实例
   */
  public registerDisconnectListener(client: AmqpConnectionManager): void {
    client.addListener(RmqEventsMap.DISCONNECT, (err: any) => {
      this._status$.next(RmqStatus.DISCONNECTED);

      if (!this.isInitialConnect) {
        this.connectionPromise = Promise.reject(
          'Error: Connection lost. Trying to reconnect...',
        );

        // Prevent unhandled promise rejection
        this.connectionPromise.catch(() => {});
      }

      this.logger.error(DISCONNECTED_RMQ_MESSAGE);
      this.logger.error(err);
    });
  }

  /**
   * 注册连接成功监听器：推送 CONNECTED 状态；
   * 首次连接时创建 channel；重连成功时恢复 connectionPromise。
   * @param client - 连接管理器实例
   */
  private registerConnectListener(client: AmqpConnectionManager): void {
    client.addListener(RmqEventsMap.CONNECT, () => {
      this._status$.next(RmqStatus.CONNECTED);
      this.logger.log('Successfully connected to RMQ broker');

      if (this.isInitialConnect) {
        this.isInitialConnect = false;

        if (!this.channel) {
          this.connectionPromise = this.createChannel();
        }
      } else {
        this.connectionPromise = Promise.resolve();
      }
    });
  }

  /**
   * 注册 broker 阻塞（流控）监听器：推送 BLOCKED 状态并打印告警。
   * @param client - 连接管理器实例
   */
  public registerBlockedListener(client: AmqpConnectionManager): void {
    client.addListener(
      RmqEventsMap.BLOCKED,
      ({ reason }: { reason: string }) => {
        this._status$.next(RmqStatus.BLOCKED);
        this.logger.warn(BLOCKED_RMQ_MESSAGE(reason));
      },
    );
  }

  /**
   * 注册解除阻塞监听器：推送 UNBLOCKED 状态并打印日志。
   * @param client - 连接管理器实例
   */
  public registerUnblockedListener(client: AmqpConnectionManager): void {
    client.addListener(RmqEventsMap.UNBLOCKED, () => {
      this._status$.next(RmqStatus.UNBLOCKED);
      this.logger.log(UNBLOCKED_RMQ_MESSAGE);
    });
  }

  /**
   * 注册连接管理器事件监听器；尚未连接时先缓存，连接后补挂。
   * @param event - 事件名
   * @param callback - 事件回调
   */
  public on<
    EventKey extends keyof RmqEvents = keyof RmqEvents,
    EventCallback extends RmqEvents[EventKey] = RmqEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.client) {
      this.client.addListener(event, callback);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  /**
   * 获取底层连接管理器实例。
   * @returns AmqpConnectionManager 实例（未连接时抛出错误）
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
   * 处理回复队列中的响应消息（两个重载：options 可省略或为回调）：
   * 反序列化后按 err / response / isDisposed 触发回调，结束或出错时终止 Observable。
   * @param packet - 原始响应内容
   * @param options - 消息选项（可为回调，见重载）
   * @param callback - 响应回调
   */
  public async handleMessage(
    packet: unknown,
    callback: (packet: WritePacket) => any,
  ): Promise<void>;
  public async handleMessage(
    packet: unknown,
    options: Record<string, unknown>,
    callback: (packet: WritePacket) => any,
  ): Promise<void>;
  public async handleMessage(
    packet: unknown,
    options:
      | Record<string, unknown>
      | ((packet: WritePacket) => any)
      | undefined,
    callback?: (packet: WritePacket) => any,
  ): Promise<void> {
    if (isFunction(options)) {
      callback = options as (packet: WritePacket) => any;
      options = undefined;
    }

    const { err, response, isDisposed } = await this.deserializer.deserialize(
      packet,
      options,
    );
    if (isDisposed || err) {
      return callback?.({
        err,
        response,
        isDisposed: true,
      });
    }
    callback?.({
      err,
      response,
    });
  }

  /**
   * 发布（请求-响应式）消息到队列/交换机，流程：
   * 1. 生成 correlationId，注册 responseEmitter 监听器（回调反序列化后触发）；
   * 2. 序列化消息并剥离 RmqRecord options，内容转为 JSON Buffer；
   * 3. 组装 sendOptions（replyTo 指向回复队列、persistent、合并 headers、correlationId）；
   * 4. wildcards/fanout 模式按 routingKey 发布到 exchange，否则直接 sendToQueue；
   * 5. 返回清理函数（移除 correlationId 监听器）。
   * @param message - 请求包
   * @param callback - 响应回调
   * @returns 取消订阅的清理函数
   */
  protected publish(
    message: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const correlationId = randomStringGenerator();
      const listener = ({
        content,
        options,
      }: {
        content: Buffer;
        options: Record<string, unknown>;
      }) =>
        this.handleMessage(
          this.parseMessageContent(content),
          options,
          callback,
        );

      Object.assign(message, { id: correlationId });
      const serializedPacket: ReadPacket & Partial<RmqRecord> =
        this.serializer.serialize(message);

      const options = serializedPacket.options;
      delete serializedPacket.options;

      this.responseEmitter.on(correlationId, listener);

      const content = Buffer.from(JSON.stringify(serializedPacket));
      const sendOptions = {
        replyTo: this.replyQueue,
        persistent: this.getOptionsProp(
          this.options,
          'persistent',
          RQM_DEFAULT_PERSISTENT,
        ),
        ...options,
        headers: this.mergeHeaders(options?.headers),
        correlationId,
      };

      if (this.options.wildcards || this.options.exchangeType === 'fanout') {
        const stringifiedPattern = isString(message.pattern)
          ? message.pattern
          : JSON.stringify(message.pattern);

        // The exchange is the same as the queue when wildcards are enabled
        // and the exchange is not explicitly set
        const exchange = this.getOptionsProp(
          this.options,
          'exchange',
          this.queue,
        );

        this.channel!.publish(
          exchange,
          stringifiedPattern,
          content,
          sendOptions,
        ).catch(err => callback({ err }));
      } else {
        this.channel!.sendToQueue(this.queue, content, sendOptions).catch(err =>
          callback({ err }),
        );
      }
      return () => this.responseEmitter.removeListener(correlationId, listener);
    } catch (err) {
      callback({ err });
      return () => {};
    }
  }

  /**
   * 发送事件（不等待响应）：序列化（剥离 options）后按 wildcards/fanout
   * 发布到 exchange 或直接 sendToQueue，发送回调决定 resolve/reject。
   * @param packet - 事件包
   * @returns 发送完成的 Promise
   */
  protected dispatchEvent(packet: ReadPacket): Promise<any> {
    const serializedPacket: ReadPacket & Partial<RmqRecord> =
      this.serializer.serialize(packet);

    const options = serializedPacket.options;
    delete serializedPacket.options;

    return new Promise<void>((resolve, reject) => {
      const content = Buffer.from(JSON.stringify(serializedPacket));
      const sendOptions = {
        persistent: this.getOptionsProp(
          this.options,
          'persistent',
          RQM_DEFAULT_PERSISTENT,
        ),
        ...options,
        headers: this.mergeHeaders(options?.headers),
      };
      const errorCallback = (err: unknown) =>
        err ? reject(err as Error) : resolve();

      return this.options.wildcards || this.options.exchangeType === 'fanout'
        ? this.channel!.publish(
            // The exchange is the same as the queue when wildcards are enabled
            // and the exchange is not explicitly set
            this.getOptionsProp(this.options, 'exchange', this.queue),
            isString(packet.pattern)
              ? packet.pattern
              : JSON.stringify(packet.pattern),
            content,
            sendOptions,
            errorCallback,
          )
        : this.channel!.sendToQueue(
            this.queue,
            content,
            sendOptions,
            errorCallback,
          );
    });
  }

  /**
   * 初始化序列化器：优先使用 options.serializer，否则默认 RmqRecordSerializer。
   * @param options - RMQ 客户端选项
   */
  protected initializeSerializer(options: RmqOptions['options']) {
    this.serializer = options?.serializer ?? new RmqRecordSerializer();
  }

  /**
   * 合并请求级 headers 与全局 options.headers（请求级优先）。
   * @param requestHeaders - 请求自带的 headers（可选）
   * @returns 合并后的 headers，或两者均无时为 undefined
   */
  protected mergeHeaders(
    requestHeaders?: Record<string, string>,
  ): Record<string, string> | undefined {
    if (!requestHeaders && !this.options?.headers) {
      return undefined;
    }

    return {
      ...this.options?.headers,
      ...requestHeaders,
    };
  }

  /**
   * 解析消息内容：尝试 JSON.parse，失败则返回原始字符串。
   * @param content - 原始消息 Buffer
   * @returns 解析后的对象或原始字符串
   */
  protected parseMessageContent(content: Buffer) {
    const rawContent = content.toString();
    try {
      return JSON.parse(rawContent);
    } catch {
      return rawContent;
    }
  }
}
