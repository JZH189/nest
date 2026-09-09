import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { REDIS_DEFAULT_HOST, REDIS_DEFAULT_PORT } from '../constants';
import {
  RedisEvents,
  RedisEventsMap,
  RedisStatus,
} from '../events/redis.events';
import { ReadPacket, RedisOptions, WritePacket } from '../interfaces';
import { ClientProxy } from './client-proxy';

// To enable type safety for Redis. This cant be uncommented by default
// because it would require the user to install the ioredis package even if they dont use Redis
// Otherwise, TypeScript would fail to compile the code.
//
// type Redis = import('ioredis').Redis;
type Redis = any;

let redisPackage = {} as any;

/**
 * 基于 Redis Pub/Sub 的客户端实现（ClientProxy 的子类）。
 * 使用两个 ioredis 连接：pubClient 发布消息、subClient 订阅响应通道
 * （响应通道名为 `请求通道.reply`），远端为 ServerRedis。
 * 依赖 ioredis 包，首次使用时才动态加载。
 *
 * @publicApi
 */
export class ClientRedis extends ClientProxy<RedisEvents, RedisStatus> {
  protected readonly logger = new Logger(ClientProxy.name);
  /** 各响应通道当前的订阅数（引用计数，归零时退订） */
  protected readonly subscriptionsCount = new Map<string, number>();
  /** 发布用 Redis 客户端 */
  protected pubClient: Redis;
  /** 订阅用 Redis 客户端 */
  protected subClient: Redis;
  /** 复用中的连接 Promise */
  protected connectionPromise: Promise<any>;
  /** 是否已手动调用 close()（区分手动关闭与意外断开） */
  protected isManuallyClosed = false;
  /** 首次连接是否已成功（决定是否注册 message 回调） */
  protected wasInitialConnectionSuccessful = false;
  /** 连接建立前注册的事件监听器缓存 */
  protected pendingEventListeners: Array<{
    event: keyof RedisEvents;
    callback: RedisEvents[keyof RedisEvents];
  }> = [];

  /**
   * @param options - Redis 客户端选项（host、port、retryAttempts 等）
   */
  constructor(protected readonly options: Required<RedisOptions>['options']) {
    super();

    redisPackage = loadPackage('ioredis', ClientRedis.name, () =>
      require('ioredis'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 获取请求（发布消息）使用的通道名，默认原样返回 pattern。
   * @param pattern - 规范化后的模式字符串
   * @returns 请求通道名
   */
  public getRequestPattern(pattern: string): string {
    return pattern;
  }

  /**
   * 获取响应（订阅）使用的通道名：在请求通道名后追加 ".reply"。
   * @param pattern - 规范化后的模式字符串
   * @returns 响应通道名
   */
  public getReplyPattern(pattern: string): string {
    return `${pattern}.reply`;
  }

  /**
   * 关闭并退出两个 Redis 客户端（标记为手动关闭，阻止重连）。
   */
  public async close() {
    this.isManuallyClosed = true;
    this.pubClient && (await this.pubClient.quit());
    this.subClient && (await this.subClient.quit());
    this.pubClient = this.subClient = null;
    this.pendingEventListeners = [];
  }

  /**
   * 建立 Redis 连接，流程：
   * 1. 已连接（两个客户端均存在）则直接复用 connectionPromise；
   * 2. 分别创建 pub/sub 两个客户端；
   * 3. 为每个客户端注册错误/重连/就绪/结束监听器，并补挂缓存的监听器；
   * 4. 并发连接两个客户端，缓存并返回连接 Promise。
   * @returns 连接完成的 Promise
   */
  public async connect(): Promise<any> {
    if (this.pubClient && this.subClient) {
      return this.connectionPromise;
    }
    this.pubClient = this.createClient();
    this.subClient = this.createClient();

    [this.pubClient, this.subClient].forEach((client, index) => {
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

    this.connectionPromise = Promise.all([
      this.subClient.connect(),
      this.pubClient.connect(),
    ]);
    await this.connectionPromise;
    return this.connectionPromise;
  }

  /**
   * 创建 ioredis 实例：合并默认 host/port 与用户 options，开启 lazyConnect（订阅时才真正连接）。
   * @returns ioredis 客户端实例
   */
  public createClient(): Redis {
    const clientInfoTag = this.getOptionsProp(this.options, 'clientInfoTag');
    return new redisPackage({
      host: REDIS_DEFAULT_HOST,
      port: REDIS_DEFAULT_PORT,
      ...this.getClientOptions(),
      ...(clientInfoTag && { clientInfoTag }),
      lazyConnect: true,
    });
  }

  /**
   * 注册错误监听器：记录错误日志。
   * @param client - Redis 客户端
   */
  public registerErrorListener(client: Redis) {
    client.addListener(RedisEventsMap.ERROR, (err: any) =>
      this.logger.error(err),
    );
  }

  /**
   * 注册重连监听器：非手动关闭时置空 connectionPromise（表示重连中）、
   * 推送 RECONNECTING 状态，并在首次连接成功过的情况下打印重连日志。
   * @param client - Redis 客户端
   */
  public registerReconnectListener(client: {
    on: (event: string, fn: () => void) => void;
  }) {
    client.on(RedisEventsMap.RECONNECTING, () => {
      if (this.isManuallyClosed) {
        return;
      }

      this.connectionPromise = Promise.reject(
        'Error: Connection lost. Trying to reconnect...',
      );

      // Prevent unhandled rejections
      this.connectionPromise.catch(() => {});

      this._status$.next(RedisStatus.RECONNECTING);

      if (this.wasInitialConnectionSuccessful) {
        this.logger.log('Reconnecting to Redis...');
      }
    });
  }

  /**
   * 注册就绪监听器：恢复 connectionPromise、推送 CONNECTED 状态；
   * 首次就绪时在 subClient 上注册 'message' 回调（即 createResponseCallback）以处理响应。
   * @param client - Redis 客户端
   */
  public registerReadyListener(client: {
    on: (event: string, fn: () => void) => void;
  }) {
    client.on(RedisEventsMap.READY, () => {
      this.connectionPromise = Promise.resolve();
      this._status$.next(RedisStatus.CONNECTED);

      this.logger.log('Connected to Redis. Subscribing to channels...');

      if (!this.wasInitialConnectionSuccessful) {
        this.wasInitialConnectionSuccessful = true;
        this.subClient.on('message', this.createResponseCallback());
      }
    });
  }

  /**
   * 注册连接结束监听器：手动关闭则忽略；
   * 否则推送 DISCONNECTED 状态——未配置 retryAttempts 时清理客户端实例
   * （下次 connect() 时重建），配置了则置空 connectionPromise 等待重连。
   * @param client - Redis 客户端
   */
  public registerEndListener(client: {
    on: (event: string, fn: () => void) => void;
  }) {
    client.on('end', () => {
      if (this.isManuallyClosed) {
        return;
      }
      this._status$.next(RedisStatus.DISCONNECTED);

      if (this.getOptionsProp(this.options, 'retryAttempts') === undefined) {
        // When retryAttempts is not specified, the connection will not be re-established
        this.logger.error('Disconnected from Redis.');

        // Clean up client instances and just recreate them when connect is called
        this.pubClient = this.subClient = null;
      } else {
        this.logger.error('Disconnected from Redis.');
        this.connectionPromise = Promise.reject(
          'Error: Connection lost. Trying to reconnect...',
        );

        // Prevent unhandled rejections
        this.connectionPromise.catch(() => {});
      }
    });
  }

  /**
   * 汇总客户端 options 并注入基于 retryAttempts/retryDelay 的重试策略。
   * @returns 传给 ioredis 的完整选项
   */
  public getClientOptions(): Partial<RedisOptions['options']> {
    const retryStrategy = (times: number) => this.createRetryStrategy(times);

    return {
      ...(this.options || {}),
      retryStrategy,
    };
  }

  /**
   * 在 pub 与 sub 两个客户端上注册事件监听器（回调首参为 'sub'/'pub' 来源标记）；
   * 尚未连接时先缓存，连接后补挂。
   * @param event - 事件名
   * @param callback - 事件回调（首参为客户端类型标记）
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

  /**
   * 获取底层 Redis 客户端实例。
   * @returns [pubClient, subClient] 数组（未连接时抛出错误）
   */
  public unwrap<T>(): T {
    if (!this.pubClient || !this.subClient) {
      throw new Error(
        'Not initialized. Please call the "connect" method first.',
      );
    }
    return [this.pubClient, this.subClient] as T;
  }

  /**
   * ioredis 重试策略：
   * 1. 手动关闭则不再重试（返回 undefined）；
   * 2. 未配置 retryAttempts 则报错并不重试；
   * 3. 重试次数耗尽则报错并停止；
   * 4. 否则返回重试间隔 retryDelay（默认 5000ms）。
   * @param times - 已重试次数
   * @returns 下次重试的延迟毫秒数，undefined 表示停止重试
   */
  public createRetryStrategy(times: number): undefined | number {
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
      this.logger.error('Retry time exhausted');
      return;
    }
    return this.getOptionsProp(this.options, 'retryDelay', 5000);
  }

  /**
   * 创建订阅消息回调：解析响应 JSON -> 反序列化 -> 按 id 从 routingMap
   * 找到对应回调并触发（isDisposed 或 err 时结束对应 Observable）。
   * @returns 订阅通道 'message' 事件的回调函数
   */
  public createResponseCallback(): (
    channel: string,
    buffer: string,
  ) => Promise<void> {
    return async (channel: string, buffer: string) => {
      const packet = JSON.parse(buffer);
      const { err, response, isDisposed, id } =
        await this.deserializer.deserialize(packet);

      const callback = this.routingMap.get(id);
      if (!callback) {
        return;
      }
      if (isDisposed || err) {
        return callback({
          err,
          response,
          isDisposed: true,
        });
      }
      callback({
        err,
        response,
      });
    };
  }

  /**
   * 发布（请求-响应式）消息到 Redis 通道，流程：
   * 1. 分配唯一 id、规范化 pattern、序列化请求包；
   * 2. 计算响应通道（pattern.reply）；若该通道尚无订阅，先订阅（成功后再发布）；
   * 3. 发布时递增通道订阅计数、登记 id -> 回调，并向请求通道发布 JSON 消息；
   * 4. 返回清理函数（递减订阅计数，归零时退订，并删除路由映射）。
   * @param partialPacket - 请求包
   * @param callback - 响应回调
   * @returns 取消订阅的清理函数
   */
  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const packet = this.assignPacketId(partialPacket);
      const pattern = this.normalizePattern(partialPacket.pattern);
      const serializedPacket = this.serializer.serialize(packet);
      const responseChannel = this.getReplyPattern(pattern);
      let subscriptionsCount =
        this.subscriptionsCount.get(responseChannel) || 0;

      const publishPacket = () => {
        subscriptionsCount = this.subscriptionsCount.get(responseChannel) || 0;
        this.subscriptionsCount.set(responseChannel, subscriptionsCount + 1);
        this.routingMap.set(packet.id, callback);
        this.pubClient.publish(
          this.getRequestPattern(pattern),
          JSON.stringify(serializedPacket),
        );
      };

      if (subscriptionsCount <= 0) {
        this.subClient.subscribe(
          responseChannel,
          (err: any) => !err && publishPacket(),
        );
      } else {
        publishPacket();
      }

      return () => {
        this.unsubscribeFromChannel(responseChannel);
        this.routingMap.delete(packet.id);
      };
    } catch (err) {
      callback({ err });
      return () => {};
    }
  }

  /**
   * 发送事件（不等待响应）：规范化 pattern、序列化后向请求通道发布，发布回调决定 resolve/reject。
   * @param packet - 事件包
   * @returns 发布完成的 Promise
   */
  protected dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const serializedPacket = this.serializer.serialize(packet);

    return new Promise<void>((resolve, reject) =>
      this.pubClient.publish(pattern, JSON.stringify(serializedPacket), err =>
        err ? reject(err) : resolve(),
      ),
    );
  }

  /**
   * 递减通道订阅计数，归零（及以下）时真正退订该通道。
   * @param channel - 响应通道名
   */
  protected unsubscribeFromChannel(channel: string) {
    const subscriptionCount = this.subscriptionsCount.get(channel)!;
    this.subscriptionsCount.set(channel, subscriptionCount - 1);

    if (subscriptionCount - 1 <= 0) {
      this.subClient.unsubscribe(channel);
    }
  }
}
