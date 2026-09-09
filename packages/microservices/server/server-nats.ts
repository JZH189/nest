import { isObject, isUndefined } from '@nestjs/common/utils/shared.utils';
import { EventEmitter } from 'events';
import {
  NATS_DEFAULT_GRACE_PERIOD,
  NATS_DEFAULT_URL,
  NO_MESSAGE_HANDLER,
} from '../constants';
import { NatsContext } from '../ctx-host/nats.context';
import { NatsRequestJSONDeserializer } from '../deserializers/nats-request-json.deserializer';
import { Transport } from '../enums';
import { NatsEvents, NatsEventsMap, NatsStatus } from '../events/nats.events';
import {
  NatsOptions,
  TransportId,
} from '../interfaces/microservice-configuration.interface';
import { IncomingRequest } from '../interfaces/packet.interface';
import { NatsRecord } from '../record-builders';
import { NatsRecordSerializer } from '../serializers/nats-record.serializer';
import { Server } from './server';

let natsPackage = {} as any;

// To enable type safety for Nats. This cant be uncommented by default
// because it would require the user to install the nats package even if they dont use Nats
// Otherwise, TypeScript would fail to compile the code.
//
// type Client = import('nats').NatsConnection;
// type NatsMsg = import('nats').Msg;
// type Subscription = import('nats').Subscription;

type Client = any;
type NatsMsg = any;
type Subscription = any;

/**
 * 基于 NATS（nats 包）的微服务服务端实现。
 *
 * 工作方式：
 * - NATS 中没有「服务端」，服务端表现为一个 NATS 连接：
 *   把每个 @MessagePattern/@EventPattern 的 pattern 当作 subject 订阅；
 * - 收到消息后反序列化为 ReadPacket，按 channel（subject）查找处理器；
 * - 带 id 且携带 reply 主题的消息是 RPC 请求：执行处理器后通过
 *   natsMsg.respond() 回发响应（附原始请求 id）；
 * - 不带 id 或无 reply 主题的消息是事件：走基类 handleEvent 分发，
 *   不回发响应。
 *
 * @publicApi
 */
export class ServerNats<
  E extends NatsEvents = NatsEvents,
  S extends NatsStatus = NatsStatus,
> extends Server<E, S> {
  /** 传输器唯一标识：NATS。 */
  public transportId: TransportId = Transport.NATS;

  /** 底层 NATS 客户端连接实例。 */
  private natsClient: Client;
  /** 状态事件发射器：把 NATS 底层连接状态转发给 on() 注册的监听器。 */
  protected statusEventEmitter = new EventEmitter<{
    [key in keyof NatsEvents]: Parameters<NatsEvents[key]>;
  }>();
  /** 当前持有的全部订阅句柄，优雅关闭时逐个取消订阅。 */
  private readonly subscriptions: Subscription[] = [];

  /**
   * @param options NATS 传输选项（servers/queue/gracePeriod/gracefulShutdown、
   * debug、序列化器/反序列化器以及透传给 nats.connect 的其余选项）
   */
  constructor(private readonly options: Required<NatsOptions>['options']) {
    super();

    // 1. 按需加载 nats 依赖包
    natsPackage = this.loadPackage('nats', ServerNats.name, () =>
      require('nats'),
    );

    // 2. 初始化 NATS 专属序列化器与反序列化器
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 连接 NATS 服务器并开始监听（由应用启动时调用）。
   * @param callback 连接成功或失败后调用的回调
   */
  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    try {
      // 1. 建立 NATS 连接并置状态为 CONNECTED
      this.natsClient = await this.createNatsClient();

      this._status$.next(NatsStatus.CONNECTED as S);
      // 2. 启动状态监听循环（异步迭代 client.status()）
      void this.handleStatusUpdates(this.natsClient);
      // 3. 订阅所有 pattern
      this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * 启动流程：订阅所有已注册的 pattern 后回调。
   * @param callback 订阅完成后调用的回调
   */
  public start(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    this.bindEvents(this.natsClient);
    callback();
  }

  /**
   * 订阅所有已注册的 pattern（subject），并绑定消息处理函数。
   * 队列组优先取处理器 extras.queue，其次取全局 options.queue。
   * @param client NATS 客户端实例
   */
  public bindEvents(client: Client) {
    // 1. 订阅辅助函数：带队列组订阅并绑定消息处理函数
    const subscribe = (channel: string, queue: string) =>
      client.subscribe(channel, {
        queue,
        callback: this.getMessageHandler(channel).bind(this),
      });

    // 2. 逐个订阅已注册的 pattern（subject），记录订阅句柄
    const defaultQueue = this.getOptionsProp(this.options, 'queue');
    const registeredPatterns = [...this.messageHandlers.keys()];
    for (const channel of registeredPatterns) {
      const handlerRef = this.messageHandlers.get(channel)!;
      const queue = handlerRef.extras?.queue ?? defaultQueue;
      const sub = subscribe(channel, queue);
      this.subscriptions.push(sub);
    }
  }

  /**
   * 等待优雅关闭的宽限期（gracePeriod，默认 5000ms），
   * 给在途请求留出完成时间。
   */
  private async waitForGracePeriod() {
    const gracePeriod = this.getOptionsProp(
      this.options,
      'gracePeriod',
      NATS_DEFAULT_GRACE_PERIOD,
    );
    await new Promise<void>(res => {
      setTimeout(() => {
        res();
      }, gracePeriod);
    });
  }

  /**
   * 关闭 NATS 连接：配置 gracefulShutdown 时先取消所有订阅并等待
   * 宽限期，再关闭连接并清理状态监听器。
   */
  public async close() {
    if (!this.natsClient) {
      return;
    }
    const graceful = this.getOptionsProp(this.options, 'gracefulShutdown');
    if (graceful) {
      // 1. 优雅关闭：取消全部订阅并等待宽限期
      this.subscriptions.forEach(sub => sub.unsubscribe());
      await this.waitForGracePeriod();
    }
    // 2. 关闭底层连接并清理状态事件监听器
    await this.natsClient?.close();
    this.statusEventEmitter.removeAllListeners();
    this.natsClient = null;
  }

  /**
   * 创建 NATS 客户端连接。
   * @returns nats.connect 返回的连接实例
   */
  public createNatsClient(): Promise<Client> {
    const options = this.options || ({} as NatsOptions);
    return natsPackage.connect({
      servers: NATS_DEFAULT_URL,
      ...options,
    });
  }

  /**
   * 返回传给 nats 订阅回调的处理函数。
   * @param channel 订阅的 subject（即消息模式）
   * @returns 接收 (error, message) 并转交 handleMessage 的异步函数
   */
  public getMessageHandler(channel: string): Function {
    return async (error: object | undefined, message: NatsMsg) => {
      if (error) {
        return this.logger.error(error);
      }
      return this.handleMessage(channel, message);
    };
  }

  /**
   * 处理单条 NATS 消息（核心分发逻辑）。
   * @param channel 收到消息的 subject（即消息模式）
   * @param natsMsg NATS 原始消息对象（含 subject/data/reply/headers）
   */
  public async handleMessage(channel: string, natsMsg: NatsMsg) {
    // 1. 提取调用方 subject、原始数据与 reply 主题，构造 NATS 上下文
    const callerSubject = natsMsg.subject;
    const rawMessage = natsMsg.data;
    const replyTo = natsMsg.reply;

    const natsCtx = new NatsContext([callerSubject, natsMsg.headers]);
    const message = await this.deserializer.deserialize(rawMessage, {
      channel,
      replyTo,
    });
    // 2. 无 id 说明是事件消息：走基类事件分发，不回发响应
    if (isUndefined((message as IncomingRequest).id)) {
      return this.handleEvent(channel, message, natsCtx);
    }
    // 3. RPC 请求：构造响应发布函数
    const publish = this.getPublisher(
      natsMsg,
      (message as IncomingRequest).id,
      natsCtx,
    );
    const handler = this.getHandlerByPattern(channel);
    if (!handler) {
      // 4. 未注册处理器：回发带 NO_MESSAGE_HANDLER 错误的响应
      const status = 'error';
      const noHandlerPacket = {
        id: (message as IncomingRequest).id,
        status,
        err: NO_MESSAGE_HANDLER,
      };
      return publish(noHandlerPacket);
    }
    // 5. 执行处理器：结果转为 Observable，经 send() 串行回发响应
    return this.onProcessingStartHook(this.transportId, natsCtx, async () => {
      const response$ = this.transformToObservable(
        await handler(message.data, natsCtx),
      );
      response$ && this.send(response$, publish);
    });
  }

  /**
   * 构造响应发布函数：消息携带 reply 主题时通过 natsMsg.respond()
   * 回发响应（附原始请求 id 与 headers）；否则返回空函数（无需响应）。
   *
   * @param natsMsg 收到的 NATS 消息
   * @param id 原始请求 id
   * @param ctx NATS 上下文
   * @returns 执行响应发布的函数（无 reply 主题时为 noop）
   */
  public getPublisher(natsMsg: NatsMsg, id: string, ctx: NatsContext) {
    if (natsMsg.reply) {
      return (response: any) => {
        // 1. 附上原始请求 id 并序列化响应
        Object.assign(response, { id });
        const outgoingResponse: NatsRecord =
          this.serializer.serialize(response);

        this.onProcessingEndHook?.(this.transportId, ctx);
        // 2. 通过 NATS 内建 reply 机制回发响应
        return natsMsg.respond(outgoingResponse.data, {
          headers: outgoingResponse.headers,
        });
      };
    }

    // In case the "reply" topic is not provided, there's no need for a reply.
    // Method returns a noop function instead

    return () => {};
  }

  /**
   * 监听 NATS 客户端连接状态变化：通过异步迭代 client.status()
   * 把 error/disconnect/reconnecting/reconnect/update 等状态映射到
   * 状态流（status）与状态事件发射器。
   * @param client NATS 客户端实例
   */
  public async handleStatusUpdates(client: Client) {
    for await (const status of client.status()) {
      const data =
        status.data && isObject(status.data)
          ? JSON.stringify(status.data)
          : status.data;

      switch (status.type) {
        case 'error':
          this.logger.error(
            `NatsError: type: "${status.type}", data: "${data}".`,
          );
          break;

        case 'disconnect':
          this.logger.error(
            `NatsError: type: "${status.type}", data: "${data}".`,
          );

          this._status$.next(NatsStatus.DISCONNECTED as S);
          this.statusEventEmitter.emit(
            NatsEventsMap.DISCONNECT,
            status.data as string,
          );
          break;

        case 'pingTimer':
          if (this.options.debug) {
            this.logger.debug!(
              `NatsStatus: type: "${status.type}", data: "${data}".`,
            );
          }
          break;

        case 'reconnecting':
          this._status$.next(NatsStatus.RECONNECTING as S);
          break;

        case 'reconnect':
          this.logger.log(
            `NatsStatus: type: "${status.type}", data: "${data}".`,
          );

          this._status$.next(NatsStatus.CONNECTED as S);
          this.statusEventEmitter.emit(
            NatsEventsMap.RECONNECT,
            status.data as string,
          );
          break;

        case 'update':
          this.logger.log(
            `NatsStatus: type: "${status.type}", data: "${data}".`,
          );
          this.statusEventEmitter.emit(NatsEventsMap.UPDATE, status.data);
          break;

        default:
          this.logger.log(
            `NatsStatus: type: "${status.type}", data: "${data}".`,
          );
          break;
      }
    }
  }

  /**
   * 暴露底层 NATS 客户端连接实例。
   * @returns 底层连接实例
   * @throws 未初始化时抛出错误
   */
  public unwrap<T>(): T {
    if (!this.natsClient) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return this.natsClient as T;
  }

  /**
   * 注册 NATS 连接状态事件监听器（内部转发自 statusEventEmitter）。
   * @param event 事件名（disconnect/reconnect/update 等）
   * @param callback 事件回调
   */
  public on<
    EventKey extends keyof E = keyof E,
    EventCallback extends E[EventKey] = E[EventKey],
  >(event: EventKey, callback: EventCallback) {
    this.statusEventEmitter.on(event as string | symbol, callback as any);
  }

  /**
   * 初始化 NATS 专属序列化器（默认 NatsRecordSerializer，
   * 把数据序列化为 data + headers 的 NatsRecord 形式）。
   * @param options NATS 传输选项
   */
  protected initializeSerializer(options: NatsOptions['options']) {
    this.serializer = options?.serializer ?? new NatsRecordSerializer();
  }

  /**
   * 初始化 NATS 专属反序列化器（默认 NatsRequestJSONDeserializer）。
   * @param options NATS 传输选项
   */
  protected initializeDeserializer(options: NatsOptions['options']) {
    this.deserializer =
      options?.deserializer ?? new NatsRequestJSONDeserializer();
  }
}
