/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {
  isNil,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import {
  BLOCKED_RMQ_MESSAGE,
  CONNECTION_FAILED_MESSAGE,
  DISCONNECTED_RMQ_MESSAGE,
  NO_MESSAGE_HANDLER,
  RMQ_SEPARATOR,
  RMQ_WILDCARD_ALL,
  RMQ_WILDCARD_SINGLE,
  RQM_DEFAULT_IS_GLOBAL_PREFETCH_COUNT,
  RQM_DEFAULT_NOACK,
  RQM_DEFAULT_NO_ASSERT,
  RQM_DEFAULT_PREFETCH_COUNT,
  RQM_DEFAULT_QUEUE,
  RQM_DEFAULT_QUEUE_OPTIONS,
  RQM_DEFAULT_URL,
  RQM_NO_EVENT_HANDLER,
  RQM_NO_MESSAGE_HANDLER,
  UNBLOCKED_RMQ_MESSAGE,
} from '../constants';
import { RmqContext } from '../ctx-host';
import { Transport } from '../enums';
import { RmqEvents, RmqEventsMap, RmqStatus } from '../events/rmq.events';
import { RmqUrl } from '../external/rmq-url.interface';
import { MessageHandler, RmqOptions, TransportId } from '../interfaces';
import {
  IncomingRequest,
  OutgoingResponse,
  ReadPacket,
} from '../interfaces/packet.interface';
import { RmqRecordSerializer } from '../serializers/rmq-record.serializer';
import { Server } from './server';

// To enable type safety for RMQ. This cant be uncommented by default
// because it would require the user to install the amqplib package even if they dont use RabbitMQ
// Otherwise, TypeScript would fail to compile the code.
//
// type AmqpConnectionManager =
//   import('amqp-connection-manager').AmqpConnectionManager;
// type ChannelWrapper = import('amqp-connection-manager').ChannelWrapper;
// type Message = import('amqplib').Message;
// type Channel = import('amqplib').Channel | import('amqplib').ConfirmChannel;

type AmqpConnectionManager = any;
type ChannelWrapper = any;
type Message = any;
type Channel = any;

let rmqPackage = {} as any; // as typeof import('amqp-connection-manager');

const INFINITE_CONNECTION_ATTEMPTS = -1;

/**
 * 基于 RabbitMQ（amqplib + amqp-connection-manager）的微服务服务端实现。
 *
 * 工作方式：
 * - 连接 RabbitMQ broker，断言（assert）队列并消费其中的消息；
 * - 支持 exchange 模式（direct/topic/fanout 等）与 wildcards 通配符
 *   路由模式（`*`/`#`，通过 topic exchange 绑定 routing key）；
 * - 收到消息后反序列化为 ReadPacket，按 pattern 查找处理器；
 * - 带 id 的消息是 RPC 请求：执行处理器后向 properties.replyTo 指定的
 *   回复队列发送响应（附 correlationId）；
 * - 不带 id 的消息是事件：走 handleEvent 分发；noAck=false 时
 *   未匹配到处理器会 nack 消息（重新入队与否视配置而定）。
 *
 * @publicApi
 */
export class ServerRMQ extends Server<RmqEvents, RmqStatus> {
  /** 传输器唯一标识：RMQ。 */
  public transportId: TransportId = Transport.RMQ;

  /** 底层连接管理器实例（amqp-connection-manager）。 */
  protected server: AmqpConnectionManager | null = null;
  /** 通道包装实例：用于断言队列/交换机与消费/发送消息。 */
  protected channel: ChannelWrapper | null = null;
  /** 已经历的连接失败次数（受 maxConnectionAttempts 限制）。 */
  protected connectionAttempts = 0;
  /** broker 连接地址列表（字符串或 RmqUrl 对象数组）。 */
  protected readonly urls: string[] | RmqUrl[];
  /** 消费的队列名（默认 'default'）。 */
  protected readonly queue: string;
  /** 是否自动确认消息（noAck=true 时不调用 ack/nack）。 */
  protected readonly noAck: boolean;
  /** 队列断言选项（durable、exclusive 等）。 */
  protected readonly queueOptions: any;
  /** 通配符路由模式下的处理器注册表：键为含 `*`/`#` 的 pattern。 */
  protected readonly wildcardHandlers = new Map<string, MessageHandler>();
  /** 连接管理器尚未创建时暂存的事件监听器，start() 后统一注册。 */
  protected pendingEventListeners: Array<{
    event: keyof RmqEvents;
    callback: RmqEvents[keyof RmqEvents];
  }> = [];

  /**
   * @param options RabbitMQ 传输选项（urls、queue、queueOptions、noAck、
   * prefetchCount、isGlobalPrefetchCount、exchange、exchangeType、routingKey、
   * wildcards、maxConnectionAttempts、socketOptions、序列化器/反序列化器等）
   */
  constructor(protected readonly options: Required<RmqOptions>['options']) {
    super();
    // 1. 读取连接地址、队列、noAck 与队列选项等核心配置
    this.urls = this.getOptionsProp(this.options, 'urls') || [RQM_DEFAULT_URL];
    this.queue =
      this.getOptionsProp(this.options, 'queue') || RQM_DEFAULT_QUEUE;
    this.noAck = this.getOptionsProp(this.options, 'noAck', RQM_DEFAULT_NOACK);
    this.queueOptions =
      this.getOptionsProp(this.options, 'queueOptions') ||
      RQM_DEFAULT_QUEUE_OPTIONS;

    // 2. 按需加载 amqplib 与 amqp-connection-manager 依赖包
    this.loadPackage('amqplib', ServerRMQ.name, () => require('amqplib'));
    rmqPackage = this.loadPackage(
      'amqp-connection-manager',
      ServerRMQ.name,
      () => require('amqp-connection-manager'),
    );

    // 3. 初始化 RMQ 专属序列化器与默认反序列化器
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 连接 RabbitMQ 并开始消费（由应用启动时调用）。
   * @param callback 连接成功或失败后调用的回调
   */
  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ): Promise<void> {
    try {
      await this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * 关闭通道与连接并清空暂存的事件监听器。
   */
  public async close(): Promise<void> {
    this.channel && (await this.channel.close());
    this.server && (await this.server.close());
    this.pendingEventListeners = [];
  }

  /**
   * 启动流程：创建连接管理器，首次连接成功后创建通道并执行
   * setupChannel（断言队列、绑定交换机、开始消费）；同时注册
   * 连接/断开/阻塞/解阻塞监听器与连接失败（重试上限）处理。
   *
   * @param callback 启动完成或失败后调用的回调
   */
  public async start(
    callback?: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    // 1. 创建连接管理器实例
    this.server = this.createClient();
    this.server!.once(RmqEventsMap.CONNECT, () => {
      if (this.channel) {
        return;
      }
      this._status$.next(RmqStatus.CONNECTED);
      // 2. 创建通道，通道就绪时执行 setupChannel 完成队列/交换机设置与消费
      this.channel = this.server!.createChannel({
        json: false,
        setup: (channel: Channel) => this.setupChannel(channel, callback!),
      });
    });

    // 3. 读取最大连接失败次数（默认 -1 表示无限重试）
    const maxConnectionAttempts = this.getOptionsProp(
      this.options,
      'maxConnectionAttempts',
      INFINITE_CONNECTION_ATTEMPTS,
    );

    // 4. 注册连接状态监听器并补注册暂存的监听器
    this.registerConnectListener();
    this.registerDisconnectListener();
    this.registerBlockedListener();
    this.registerUnblockedListener();
    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.server!.on(event, callback),
    );
    this.pendingEventListeners = [];

    // 5. 处理连接失败：记录日志，达到最大重试次数（且未在重连中）时关闭并回调错误
    const connectFailedEvent = 'connectFailed';
    this.server!.once(
      connectFailedEvent,
      async (error: Record<string, unknown>) => {
        this._status$.next(RmqStatus.DISCONNECTED);

        this.logger.error(CONNECTION_FAILED_MESSAGE);
        if (error?.err) {
          this.logger.error(error.err);
        }
        const isReconnecting = !!this.channel;
        if (
          maxConnectionAttempts === INFINITE_CONNECTION_ATTEMPTS ||
          isReconnecting
        ) {
          return;
        }
        if (++this.connectionAttempts === maxConnectionAttempts) {
          await this.close();
          callback?.(error.err ?? new Error(CONNECTION_FAILED_MESSAGE));
        }
      },
    );
  }

  /**
   * 创建 amqp-connection-manager 连接管理器实例。
   * @returns 连接管理器实例
   */
  public createClient<T = any>(): T {
    const socketOptions = this.getOptionsProp(this.options, 'socketOptions');
    return rmqPackage.connect(this.urls, {
      connectionOptions: socketOptions?.connectionOptions,
      heartbeatIntervalInSeconds: socketOptions?.heartbeatIntervalInSeconds,
      reconnectTimeInSeconds: socketOptions?.reconnectTimeInSeconds,
    });
  }

  /**
   * 注册「已连接」事件监听器：状态置为 CONNECTED。
   */
  private registerConnectListener() {
    this.server!.on(RmqEventsMap.CONNECT, (err: any) => {
      this._status$.next(RmqStatus.CONNECTED);
    });
  }

  /**
   * 注册「断开」事件监听器：状态置为 DISCONNECTED 并记录错误。
   */
  private registerDisconnectListener() {
    this.server!.on(RmqEventsMap.DISCONNECT, (err: any) => {
      this._status$.next(RmqStatus.DISCONNECTED);
      this.logger.error(DISCONNECTED_RMQ_MESSAGE);
      this.logger.error(err);
    });
  }

  /**
   * 注册「broker 阻塞」事件监听器：状态置为 BLOCKED 并输出警告
   * （通常因内存/磁盘告警触发连接阻塞）。
   */
  private registerBlockedListener() {
    this.server!.on(RmqEventsMap.BLOCKED, ({ reason }: { reason: string }) => {
      this._status$.next(RmqStatus.BLOCKED);
      this.logger.warn(BLOCKED_RMQ_MESSAGE(reason));
    });
  }

  /**
   * 注册「解除阻塞」事件监听器：状态置为 UNBLOCKED。
   */
  private registerUnblockedListener() {
    this.server!.on(RmqEventsMap.UNBLOCKED, () => {
      this._status$.next(RmqStatus.UNBLOCKED);
      this.logger.log(UNBLOCKED_RMQ_MESSAGE);
    });
  }

  /**
   * 通道就绪后的初始化：断言队列、按需断言交换机并绑定队列、
   * 设置 prefetch，然后开始消费队列中的消息。
   *
   * @param channel amqplib 通道实例
   * @param callback 通道设置完成后调用的回调
   */
  public async setupChannel(channel: Channel, callback: Function) {
    // 1. 读取 noAssert 选项：为 true 且队列名非默认时跳过 assertQueue
    const noAssert =
      this.getOptionsProp(this.options, 'noAssert') ??
      this.queueOptions.noAssert ??
      RQM_DEFAULT_NO_ASSERT;

    let createdQueue: string;

    if (this.queue === RQM_DEFAULT_QUEUE || !noAssert) {
      // 2. 断言队列（不存在则创建），得到最终队列名
      const { queue } = await channel.assertQueue(
        this.queue,
        this.queueOptions,
      );
      createdQueue = queue;
    } else {
      createdQueue = this.queue;
    }

    // 3. 读取 prefetch 配置（每次最多未确认消息数，可全局或按消费者生效）
    const isGlobalPrefetchCount = this.getOptionsProp(
      this.options,
      'isGlobalPrefetchCount',
      RQM_DEFAULT_IS_GLOBAL_PREFETCH_COUNT,
    );
    const prefetchCount = this.getOptionsProp(
      this.options,
      'prefetchCount',
      RQM_DEFAULT_PREFETCH_COUNT,
    );

    if (this.options.exchange || this.options.wildcards) {
      // Use queue name as exchange name if exchange is not provided and "wildcards" is set to true
      // 4. 配置了 exchange 或 wildcards：断言交换机
      //（wildcards 模式且未指定 exchange 时以队列名作为交换机名）
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

      if (this.options.routingKey || this.options.exchangeType === 'fanout') {
        // 5. 按指定 routingKey（fanout 时为空串）把队列绑定到交换机
        await channel.bindQueue(
          createdQueue,
          exchange,
          this.options.exchangeType === 'fanout' ? '' : this.options.routingKey,
        );
      }

      if (this.options.wildcards) {
        // 6. wildcards 模式：把每个 pattern 作为 routing key 绑定到队列，
        //    并初始化通配符处理器注册表，用于后续消息与处理器匹配
        const routingKeys = Array.from(this.getHandlers().keys());
        await Promise.all(
          routingKeys.map(routingKey =>
            channel.bindQueue(createdQueue, exchange, routingKey),
          ),
        );

        // When "wildcards" is set to true,  we need to initialize wildcard handlers
        // otherwise we would not be able to associate the incoming messages with the handlers
        this.initializeWildcardHandlersIfExist();
      }
    }

    // 7. 设置 prefetch 上限并开始消费队列
    await channel.prefetch(prefetchCount, isGlobalPrefetchCount);
    channel.consume(
      createdQueue,
      (msg: Record<string, any> | null) => this.handleMessage(msg!, channel),
      {
        noAck: this.noAck,
        consumerTag: this.getOptionsProp(
          this.options,
          'consumerTag',
          undefined,
        ),
      },
    );
    callback();
  }

  /**
   * 处理单条 RabbitMQ 消息（核心分发逻辑）。
   * @param message amqplib 消息对象（content 与 properties）
   * @param channel 收到消息的通道（用于确认/回发）
   */
  public async handleMessage(
    message: Record<string, any>,
    channel: any,
  ): Promise<void> {
    // 1. 消息为空（如队列被删除）时直接忽略
    if (isNil(message)) {
      return;
    }
    // 2. 解析内容并反序列化，pattern 统一转为字符串
    const { content, properties } = message;
    const rawMessage = this.parseMessageContent(content);
    const packet = await this.deserializer.deserialize(rawMessage, properties);
    const pattern = isString(packet.pattern)
      ? packet.pattern
      : JSON.stringify(packet.pattern);

    const rmqContext = new RmqContext([message, channel, pattern]);
    // 3. 无 id 说明是事件消息：走 RMQ 版 handleEvent（noAck=false 时会 nack）
    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(pattern, packet, rmqContext);
    }
    const handler = this.getHandlerByPattern(pattern);

    if (!handler) {
      // 4. 未注册处理器：noAck=false 时 nack 消息（不重新入队），
      //    并向 replyTo 队列回发 NO_MESSAGE_HANDLER 错误响应
      if (!this.noAck) {
        this.logger.warn(RQM_NO_MESSAGE_HANDLER`${pattern}`);
        this.channel!.nack(rmqContext.getMessage() as Message, false, false);
      }
      const status = 'error';
      const noHandlerPacket = {
        id: (packet as IncomingRequest).id,
        err: NO_MESSAGE_HANDLER,
        status,
      };
      return this.sendMessage(
        noHandlerPacket,
        properties.replyTo,
        properties.correlationId,
        rmqContext,
      );
    }
    // 5. 执行处理器：结果转为 Observable，经 send() 串行向 replyTo 队列回发响应
    return this.onProcessingStartHook(
      this.transportId,
      rmqContext,
      async () => {
        const response$ = this.transformToObservable(
          await handler(packet.data, rmqContext),
        );

        const publish = <T>(data: T) =>
          this.sendMessage(
            data,
            properties.replyTo,
            properties.correlationId,
            rmqContext,
          );

        response$ && this.send(response$, publish);
      },
    );
  }

  /**
   * RabbitMQ 版本的事件处理：在基类逻辑之上增加确认语义——
   * noAck=false 且未找到事件处理器时先 nack 消息（不重新入队）再告警。
   * @param pattern 消息模式
   * @param packet 入站消息包
   * @param context RMQ 上下文
   */
  public async handleEvent(
    pattern: string,
    packet: ReadPacket,
    context: RmqContext,
  ): Promise<any> {
    const handler = this.getHandlerByPattern(pattern);
    if (!handler && !this.noAck) {
      this.channel!.nack(context.getMessage() as Message, false, false);
      return this.logger.warn(RQM_NO_EVENT_HANDLER`${pattern}`);
    }
    return super.handleEvent(pattern, packet, context);
  }

  /**
   * 序列化响应并发送到 replyTo 指定的回复队列
   * （RabbitMQ 通过 correlationId 将响应与请求配对）。
   *
   * @param message 响应数据
   * @param replyTo 回复队列名（来自请求消息属性）
   * @param correlationId 关联 ID（来自请求消息属性）
   * @param context RMQ 上下文
   */
  public sendMessage<T = any>(
    message: T,
    replyTo: any,
    correlationId: string,
    context: RmqContext,
  ): void {
    // 1. 序列化响应（RmqRecord 可携带发送选项）
    const outgoingResponse = this.serializer.serialize(
      message as unknown as OutgoingResponse,
    );
    const options = outgoingResponse.options;
    delete outgoingResponse.options;

    // 2. 合并 correlationId 与自定义选项后发送到回复队列
    const buffer = Buffer.from(JSON.stringify(outgoingResponse));
    const sendOptions = { correlationId, ...options };

    this.onProcessingEndHook?.(this.transportId, context);
    this.channel!.sendToQueue(replyTo, buffer, sendOptions);
  }

  /**
   * 暴露底层 amqp 连接管理器实例。
   * @returns 连接管理器实例
   * @throws 未初始化时抛出错误
   */
  public unwrap<T>(): T {
    if (!this.server) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return this.server as T;
  }

  /**
   * 注册底层连接管理器事件监听器；连接尚未创建时先暂存，
   * start() 后自动补注册。
   * @param event 事件名
   * @param callback 事件回调
   */
  public on<
    EventKey extends keyof RmqEvents = keyof RmqEvents,
    EventCallback extends RmqEvents[EventKey] = RmqEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.server) {
      this.server.addListener(event, callback);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  /**
   * RMQ 覆盖版本的处理器查找：未启用 wildcards 时按精确匹配；
   * 启用时先做精确匹配，失败后再对通配符处理器做模式匹配。
   * @param pattern 消息模式（routing key）
   * @returns 匹配到的处理器；未匹配时返回 null
   */
  public getHandlerByPattern(pattern: string): MessageHandler | null {
    if (!this.options.wildcards) {
      return super.getHandlerByPattern(pattern);
    }

    // Search for non-wildcard handler first
    // 1. 优先精确匹配普通处理器
    const handler = super.getHandlerByPattern(pattern);
    if (handler) {
      return handler;
    }

    // Search for wildcard handler
    // 2. 精确匹配失败：遍历通配符处理器逐个模式匹配
    if (this.wildcardHandlers.size === 0) {
      return null;
    }
    for (const [wildcardPattern, handler] of this.wildcardHandlers) {
      if (this.matchRmqPattern(wildcardPattern, pattern)) {
        return handler;
      }
    }
    return null;
  }

  /**
   * 初始化 RMQ 专属序列化器（默认 RmqRecordSerializer，
   * 把数据序列化为 content + properties（含 headers/options）形式）。
   * @param options RMQ 传输选项
   */
  protected initializeSerializer(options: RmqOptions['options']) {
    this.serializer = options?.serializer ?? new RmqRecordSerializer();
  }

  /**
   * 把 Buffer 内容解析为 JSON 对象，解析失败时返回字符串形式。
   * @param content 原始消息内容
   * @returns 解析后的对象或字符串
   */
  private parseMessageContent(content: Buffer) {
    try {
      return JSON.parse(content.toString());
    } catch {
      return content.toString();
    }
  }

  /**
   * 把注册表中含 `*`/`#` 通配符的 pattern 收集到通配符处理器注册表
   * （仅在 wildcards 模式下由 setupChannel 调用一次）。
   */
  protected initializeWildcardHandlersIfExist() {
    if (this.wildcardHandlers.size !== 0) {
      return;
    }
    const handlers = this.getHandlers();

    handlers.forEach((handler, pattern) => {
      if (typeof pattern !== 'string') {
        return;
      }

      if (
        pattern.includes(RMQ_WILDCARD_ALL) ||
        pattern.includes(RMQ_WILDCARD_SINGLE)
      ) {
        this.wildcardHandlers.set(pattern, handler);
      }
    });
  }

  /**
   * RabbitMQ 通配符模式匹配：支持 `*`（单段通配）与 `#`（多段通配），
   * 用 pattern 与消息的 routing key 按 '.' 分段比较。
   * @param pattern 通配符 pattern（如 "user.*.#"）
   * @param routingKey 消息的 routing key
   * @returns 是否匹配
   */
  private matchRmqPattern(pattern: string, routingKey: string): boolean {
    if (!routingKey) {
      return pattern === RMQ_WILDCARD_ALL;
    }

    // 1. 按 '.' 分段逐段比较
    const patternSegments = pattern.split(RMQ_SEPARATOR);
    const routingKeySegments = routingKey.split(RMQ_SEPARATOR);

    const patternSegmentsLength = patternSegments.length;
    const routingKeySegmentsLength = routingKeySegments.length;
    const lastIndex = patternSegmentsLength - 1;

    for (const [i, currentPattern] of patternSegments.entries()) {
      const currentRoutingKey = routingKeySegments[i];

      if (!currentRoutingKey && !currentPattern) {
        continue;
      }
      if (!currentRoutingKey && currentPattern !== RMQ_WILDCARD_ALL) {
        // 2. routing key 段不足且 pattern 不是 # 通配：不匹配
        return false;
      }
      if (currentPattern === RMQ_WILDCARD_ALL) {
        // 3. # 只能出现在最后一段，匹配剩余全部层级
        return i === lastIndex;
      }
      if (
        currentPattern !== RMQ_WILDCARD_SINGLE &&
        currentPattern !== currentRoutingKey
      ) {
        // 4. 普通段必须完全相等
        return false;
      }
    }
    return patternSegmentsLength === routingKeySegmentsLength;
  }
}
