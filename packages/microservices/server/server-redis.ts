import { isUndefined } from '@nestjs/common/utils/shared.utils';
import {
  NO_MESSAGE_HANDLER,
  REDIS_DEFAULT_HOST,
  REDIS_DEFAULT_PORT,
} from '../constants';
import { RedisContext } from '../ctx-host';
import { Transport } from '../enums';
import {
  RedisEvents,
  RedisEventsMap,
  RedisStatus,
} from '../events/redis.events';
import { IncomingRequest, RedisOptions, TransportId } from '../interfaces';

import { Server } from './server';

// To enable type safety for Redis. This cant be uncommented by default
// because it would require the user to install the ioredis package even if they dont use Redis
// Otherwise, TypeScript would fail to compile the code.
//
// type Redis = import('ioredis').Redis;
type Redis = any;

let redisPackage = {} as any;

/**
 * 基于 Redis Pub/Sub（ioredis）的微服务服务端实现。
 *
 * 工作方式：
 * - 使用两个 ioredis 客户端：订阅客户端（subClient）订阅所有
 *   @MessagePattern/@EventPattern 的 pattern（channel），发布客户端
 *   （pubClient）用于向 `{pattern}.reply` 频道回发响应；
 * - 收到消息后反序列化为 ReadPacket，按 channel 查找处理器；
 * - 带 id 的消息是 RPC 请求：执行处理器后向 reply 频道发布响应
 *   （附原始请求 id）；
 * - 不带 id 的消息是事件：走基类 handleEvent 分发，不回发响应。
 * - options.wildcards 启用时使用 psubscribe（`*` 通配符订阅）。
 *
 * @publicApi
 */
export class ServerRedis extends Server<RedisEvents, RedisStatus> {
  /** 传输器唯一标识：REDIS。 */
  public transportId: TransportId = Transport.REDIS;

  /** 订阅客户端：负责订阅频道并接收消息。 */
  protected subClient: Redis;
  /** 发布客户端：负责向 reply 频道发布响应。 */
  protected pubClient: Redis;
  /** 是否由用户主动调用 close() 关闭（区分意外断开，决定是否重连）。 */
  protected isManuallyClosed = false;
  /** 首次连接是否成功过（用于控制重连日志输出）。 */
  protected wasInitialConnectionSuccessful = false;
  /** 客户端尚未创建时暂存的事件监听器，listen() 后统一注册。 */
  protected pendingEventListeners: Array<{
    event: keyof RedisEvents;
    callback: RedisEvents[keyof RedisEvents];
  }> = [];

  /**
   * @param options Redis 传输选项（host、port、retryAttempts、retryDelay、
   * wildcards、clientInfoTag、序列化器/反序列化器等）
   */
  constructor(protected readonly options: Required<RedisOptions>['options']) {
    super();

    // 1. 按需加载 ioredis 依赖包
    redisPackage = this.loadPackage('ioredis', ServerRedis.name, () =>
      require('ioredis'),
    );

    // 2. 初始化序列化器与默认反序列化器
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 创建订阅/发布两个 Redis 客户端并开始监听（由应用启动时调用）。
   * @param callback 连接成功或失败后调用的回调
   */
  public listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    try {
      // 1. 分别创建订阅客户端与发布客户端
      this.subClient = this.createRedisClient();
      this.pubClient = this.createRedisClient();

      // 2. 为两个客户端注册错误/重连/就绪/断开监听器，并补注册暂存的监听器
      [this.subClient, this.pubClient].forEach((client, index) => {
        const type = index === 0 ? 'pub' : 'sub';
        this.registerErrorListener(client);
        this.registerReconnectListener(client);
        this.registerReadyListener(client);
        this.registerEndListener(client);
        this.pendingEventListeners.forEach(({ event, callback }) =>
          client.on(event, (...args: [any]) => callback(type, ...args)),
        );
      });
      this.pendingEventListeners = [];

      // 3. 等待两个客户端连接完成后订阅频道
      this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * 等待两个客户端连接完成后，订阅所有 pattern（channel）。
   * @param callback 连接与订阅完成后调用的回调
   */
  public start(callback?: () => void) {
    void Promise.all([this.subClient.connect(), this.pubClient.connect()])
      .then(() => {
        this.bindEvents(this.subClient, this.pubClient);
        callback?.();
      })
      .catch(callback);
  }

  /**
   * 订阅所有已注册的 pattern（channel），并绑定消息处理函数。
   * options.wildcards 启用时使用 psubscribe 通配符订阅。
   * @param subClient 订阅客户端
   * @param pubClient 发布客户端
   */
  public bindEvents(subClient: Redis, pubClient: Redis) {
    // 1. 根据是否启用通配符订阅，监听 pmessage 或 message 事件
    subClient.on(
      this.options?.wildcards ? 'pmessage' : 'message',
      this.getMessageHandler(pubClient).bind(this),
    );
    // 2. 逐个订阅已注册的 pattern（事件处理器直接订阅，RPC 处理器经
    //    getRequestPattern 转换）
    const subscribePatterns = [...this.messageHandlers.keys()];
    subscribePatterns.forEach(pattern => {
      const { isEventHandler } = this.messageHandlers.get(pattern)!;

      const channel = isEventHandler
        ? pattern
        : this.getRequestPattern(pattern);

      if (this.options?.wildcards) {
        subClient.psubscribe(channel);
      } else {
        subClient.subscribe(channel);
      }
    });
  }

  /**
   * 关闭两个 Redis 连接并清空暂存的事件监听器。
   */
  public async close() {
    this.isManuallyClosed = true;
    this.pubClient && (await this.pubClient.quit());
    this.subClient && (await this.subClient.quit());
    this.pendingEventListeners = [];
  }

  /**
   * 创建 ioredis 客户端实例（延迟连接，lazyConnect: true）。
   * @returns ioredis 客户端实例
   */
  public createRedisClient(): Redis {
    const clientInfoTag = this.getOptionsProp(this.options, 'clientInfoTag');
    return new redisPackage({
      port: REDIS_DEFAULT_PORT,
      host: REDIS_DEFAULT_HOST,
      ...this.getClientOptions(),
      ...(clientInfoTag && { clientInfoTag }),
      lazyConnect: true,
    });
  }

  /**
   * 返回传给 Redis 'message'/'pmessage' 事件的处理函数；
   * 通配符订阅时回调签名多了 pattern 参数。
   * @param pub 发布客户端（用于回发响应）
   * @returns 消息处理函数
   */
  public getMessageHandler(pub: Redis) {
    return this.options?.wildcards
      ? (channel: string, pattern: string, buffer: string) =>
          this.handleMessage(channel, buffer, pub, pattern)
      : (channel: string, buffer: string) =>
          this.handleMessage(channel, buffer, pub, channel);
  }

  /**
   * 处理单条 Redis 消息（核心分发逻辑）。
   * @param channel 收到消息的频道（即消息模式）
   * @param buffer 原始消息内容
   * @param pub 发布客户端（用于回发响应）
   * @param pattern 匹配到的订阅模式（通配符订阅时可能与 channel 不同）
   */
  public async handleMessage(
    channel: string,
    buffer: string,
    pub: Redis,
    pattern: string,
  ) {
    // 1. 解析 JSON 并反序列化为 ReadPacket，构造 Redis 上下文
    const rawMessage = this.parseMessage(buffer);
    const packet = await this.deserializer.deserialize(rawMessage, { channel });
    const redisCtx = new RedisContext([pattern]);

    // 2. 无 id 说明是事件消息：走基类事件分发，不回发响应
    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(channel, packet, redisCtx);
    }
    // 3. RPC 请求：构造向 {pattern}.reply 频道发布响应的发布函数
    const publish = this.getPublisher(
      pub,
      channel,
      (packet as IncomingRequest).id,
      redisCtx,
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
    return this.onProcessingStartHook?.(
      this.transportId,
      redisCtx,
      async () => {
        const response$ = this.transformToObservable(
          await handler(packet.data, redisCtx),
        );
        response$ && this.send(response$, publish);
      },
    );
  }

  /**
   * 构造响应发布函数：把响应序列化后发布到请求频道对应的
   * reply 频道（`{pattern}.reply`），并附上原始请求 id。
   *
   * @param pub 发布客户端
   * @param pattern 请求频道（即消息模式）
   * @param id 原始请求 id
   * @param ctx Redis 上下文
   * @returns 执行响应发布的函数
   */
  public getPublisher(pub: Redis, pattern: any, id: string, ctx: RedisContext) {
    return (response: any) => {
      // 1. 附上原始请求 id 并序列化响应
      Object.assign(response, { id });
      const outgoingResponse = this.serializer.serialize(response);

      this.onProcessingEndHook?.(this.transportId, ctx);
      // 2. 发布到 reply 频道
      return pub.publish(
        this.getReplyPattern(pattern),
        JSON.stringify(outgoingResponse),
      );
    };
  }

  /**
   * 把 JSON 字符串解析为消息对象，解析失败时原样返回。
   * @param content 原始消息内容
   * @returns 解析后的对象或原值
   */
  public parseMessage(content: any): Record<string, any> {
    try {
      return JSON.parse(content);
    } catch (e) {
      return content;
    }
  }

  /**
   * 获取请求订阅使用的频道（默认原样返回，供子类扩展）。
   * @param pattern 原始 pattern
   * @returns 订阅使用的频道
   */
  public getRequestPattern(pattern: string): string {
    return pattern;
  }

  /**
   * 由请求频道推导响应频道：追加 '.reply' 后缀。
   * @param pattern 请求频道
   * @returns 响应频道（{pattern}.reply）
   */
  public getReplyPattern(pattern: string): string {
    return `${pattern}.reply`;
  }

  /**
   * 注册「错误」事件监听器：记录错误日志。
   * @param client Redis 客户端实例
   */
  public registerErrorListener(client: any) {
    client.on(RedisEventsMap.ERROR, (err: any) => this.logger.error(err));
  }

  /**
   * 注册「重连中」事件监听器：非手动关闭时状态置为 RECONNECTING。
   * @param client Redis 客户端实例
   */
  public registerReconnectListener(client: {
    on: (event: string, fn: () => void) => void;
  }) {
    client.on(RedisEventsMap.RECONNECTING, () => {
      if (this.isManuallyClosed) {
        return;
      }
      this._status$.next(RedisStatus.RECONNECTING);

      if (this.wasInitialConnectionSuccessful) {
        this.logger.log('Reconnecting to Redis...');
      }
    });
  }

  /**
   * 注册「就绪」事件监听器：状态置为 CONNECTED 并标记首次连接成功。
   * @param client Redis 客户端实例
   */
  public registerReadyListener(client: {
    on: (event: string, fn: () => void) => void;
  }) {
    client.on(RedisEventsMap.READY, () => {
      this._status$.next(RedisStatus.CONNECTED);

      this.logger.log('Connected to Redis. Subscribing to channels...');

      if (!this.wasInitialConnectionSuccessful) {
        this.wasInitialConnectionSuccessful = true;
      }
    });
  }

  /**
   * 注册「断开」事件监听器：非手动关闭时状态置为 DISCONNECTED
   * 并记录错误（此后 ioredis 不再自动重连）。
   * @param client Redis 客户端实例
   */
  public registerEndListener(client: {
    on: (event: string, fn: () => void) => void;
  }) {
    client.on('end', () => {
      if (this.isManuallyClosed) {
        return;
      }
      this._status$.next(RedisStatus.DISCONNECTED);

      this.logger.error(
        'Disconnected from Redis. No further reconnection attempts will be made.',
      );
    });
  }

  /**
   * 汇总 ioredis 客户端选项：用户配置 + 自动重试策略。
   * @returns 合并后的客户端选项
   */
  public getClientOptions(): Partial<RedisOptions['options']> {
    const retryStrategy = (times: number) => this.createRetryStrategy(times);

    return {
      ...(this.options || {}),
      retryStrategy,
    };
  }

  /**
   * ioredis 重试策略：手动关闭或未配置/超出 retryAttempts 次数时停止重试，
   * 否则返回 retryDelay（默认 5000ms）作为下次重试的等待时间。
   * @param times 已重试次数
   * @returns 下次重试延迟（毫秒）；停止重试时返回 undefined
   */
  public createRetryStrategy(times: number): undefined | number | void {
    if (this.isManuallyClosed) {
      return undefined;
    }
    if (!this.getOptionsProp(this.options, 'retryAttempts')) {
      this.logger.error(
        'Redis connection closed and retry attempts not specified',
      );
      return;
    }
    if (times > this.getOptionsProp(this.options, 'retryAttempts', 0)) {
      this.logger.error(`Retry time exhausted`);
      return;
    }
    return this.getOptionsProp(this.options, 'retryDelay', 5000);
  }

  /**
   * 暴露底层 [发布客户端, 订阅客户端] 数组。
   * @returns ioredis 客户端实例数组
   * @throws 未初始化时抛出错误
   */
  public unwrap<T>(): T {
    if (!this.pubClient || !this.subClient) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return [this.pubClient, this.subClient] as T;
  }

  /**
   * 注册两个客户端的通用事件监听器（回调首参为 'pub'/'sub' 区分来源）；
   * 客户端尚未创建时先暂存，listen() 后自动补注册。
   * @param event 事件名
   * @param callback 事件回调
   */
  public on<
    EventKey extends keyof RedisEvents = keyof RedisEvents,
    EventCallback extends RedisEvents[EventKey] = RedisEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.subClient && this.pubClient) {
      this.subClient.on(event, (...args: [any]) => callback('sub', ...args));
      this.pubClient.on(event, (...args: [any]) => callback('pub', ...args));
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }
}
