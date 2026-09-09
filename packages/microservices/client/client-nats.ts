import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { EventEmitter } from 'stream';
import { NATS_DEFAULT_URL } from '../constants';
import { NatsResponseJSONDeserializer } from '../deserializers/nats-response-json.deserializer';
import { EmptyResponseException } from '../errors/empty-response.exception';
import { NatsEvents, NatsEventsMap, NatsStatus } from '../events/nats.events';
import { NatsOptions, PacketId, ReadPacket, WritePacket } from '../interfaces';
import { NatsRecord } from '../record-builders';
import { NatsRecordSerializer } from '../serializers/nats-record.serializer';
import { ClientProxy } from './client-proxy';

let natsPackage = {} as any;

// To enable type safety for Nats. This cant be uncommented by default
// because it would require the user to install the nats package even if they dont use Nats
// Otherwise, TypeScript would fail to compile the code.
//
// type Client = import('nats').NatsConnection;
// type NatsMsg = import('nats').Msg;

type Client = Record<string, any>;
type NatsMsg = Record<string, any>;

/**
 * 基于 NATS 的客户端实现（ClientProxy 的子类）。
 * 请求-响应通过 NATS 的 reply inbox 机制实现：为每个请求创建一次性订阅（inbox），
 * 发布消息时把 inbox 作为 reply 主题，远端 ServerNats 的响应会被投递回该 inbox。
 * 依赖 nats 包，首次使用时才动态加载。
 *
 * @publicApi
 */
export class ClientNats extends ClientProxy<NatsEvents, NatsStatus> {
  protected readonly logger = new Logger(ClientNats.name);

  /** NATS 连接实例（未连接时为 null） */
  protected natsClient: Client | null = null;
  /** 复用中的连接 Promise */
  protected connectionPromise: Promise<Client> | null = null;
  /** 连接状态事件发射器（供 on() 注册 disconnect/reconnect 等监听） */
  protected statusEventEmitter = new EventEmitter<{
    [key in keyof NatsEvents]: Parameters<NatsEvents[key]>;
  }>();

  /**
   * @param options - NATS 客户端选项（servers、headers、debug 等）
   */
  constructor(protected readonly options: Required<NatsOptions>['options']) {
    super();
    natsPackage = loadPackage('nats', ClientNats.name, () => require('nats'));

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 关闭 NATS 连接，移除所有状态监听器并清理引用。
   */
  public async close() {
    await this.natsClient?.close();
    this.statusEventEmitter.removeAllListeners();

    this.natsClient = null;
    this.connectionPromise = null;
  }

  /**
   * 建立 NATS 连接，流程：
   * 1. 已有 connectionPromise 则直接复用；
   * 2. 调用 createClient() 建立连接，失败时清空 connectionPromise 并抛错；
   * 3. 推送 CONNECTED 状态，并异步循环消费客户端状态更新（断线/重连等）。
   * @returns NATS 客户端实例的 Promise
   */
  public async connect(): Promise<any> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    this.connectionPromise = this.createClient();
    this.natsClient = await this.connectionPromise.catch(err => {
      this.connectionPromise = null;
      throw err;
    });

    this._status$.next(NatsStatus.CONNECTED);
    void this.handleStatusUpdates(this.natsClient);
    return this.natsClient;
  }

  /**
   * 创建 NATS 连接：合并默认 server 地址与用户 options 后调用 nats.connect()。
   * @returns NATS 客户端实例的 Promise
   */
  public createClient(): Promise<Client> {
    const options = this.options || ({} as NatsOptions);
    return natsPackage.connect({
      servers: NATS_DEFAULT_URL,
      ...options,
    });
  }

  /**
   * 持续消费 NATS 客户端的状态更新事件：
   * - error：记日志；disconnect：置空 connectionPromise、推送 DISCONNECTED 并发出 DISCONNECT 事件；
   * - reconnecting：推送 RECONNECTING；reconnect：恢复 connectionPromise、推送 CONNECTED；
   * - pingTimer：debug 模式下记日志；update 及其他类型记日志并按需发出事件。
   * @param client - NATS 客户端实例
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
          this.connectionPromise = Promise.reject(
            'Error: Connection lost. Trying to reconnect...',
          );
          // Prevent unhandled promise rejection
          this.connectionPromise.catch(() => {});

          this.logger.error(
            `NatsError: type: "${status.type}", data: "${data}".`,
          );

          this._status$.next(NatsStatus.DISCONNECTED);
          this.statusEventEmitter.emit(
            NatsEventsMap.DISCONNECT,
            status.data as string,
          );
          break;

        case 'reconnecting':
          this._status$.next(NatsStatus.RECONNECTING);
          break;

        case 'reconnect':
          this.connectionPromise = Promise.resolve(client);
          this.logger.log(
            `NatsStatus: type: "${status.type}", data: "${data}".`,
          );

          this._status$.next(NatsStatus.CONNECTED);
          this.statusEventEmitter.emit(
            NatsEventsMap.RECONNECT,
            status.data as string,
          );
          break;

        case 'pingTimer':
          if (this.options.debug) {
            this.logger.debug(
              `NatsStatus: type: "${status.type}", data: "${data}".`,
            );
          }
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
   * 在内部状态事件发射器上注册监听器（disconnect、reconnect、update 等）。
   * @param event - 事件名
   * @param callback - 事件回调
   */
  public on<
    EventKey extends keyof NatsEvents = keyof NatsEvents,
    EventCallback extends NatsEvents[EventKey] = NatsEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    this.statusEventEmitter.on(event as string | symbol, callback as any);
  }

  /**
   * 获取底层 NATS 客户端实例。
   * @returns NATS 客户端实例（未连接时抛出错误）
   */
  public unwrap<T>(): T {
    if (!this.natsClient) {
      throw new Error(
        'Not initialized. Please call the "connect" method first.',
      );
    }
    return this.natsClient as T;
  }

  /**
   * 创建 inbox 订阅的消息处理回调：
   * 1. 出错时直接以错误回调；
   * 2. 收到空响应则抛 EmptyResponseException 并结束；
   * 3. 反序列化消息后校验 id 与请求匹配（不匹配则忽略）；
   * 4. 按 err / response / isDisposed 触发回调，结束或出错时终止 Observable。
   * @param packet - 已分配 id 的请求包
   * @param callback - 响应回调
   * @returns 供 NATS 订阅使用的消息回调
   */
  public createSubscriptionHandler(
    packet: ReadPacket & PacketId,
    callback: (packet: WritePacket) => any,
  ) {
    return async (error: string | Error | undefined, natsMsg: NatsMsg) => {
      if (error) {
        return callback({
          err: error,
        });
      }
      const rawPacket = natsMsg.data;
      if (rawPacket?.length === 0) {
        return callback({
          err: new EmptyResponseException(
            this.normalizePattern(packet.pattern),
          ),
          isDisposed: true,
        });
      }
      const message = await this.deserializer.deserialize(rawPacket);
      if (message.id && message.id !== packet.id) {
        return undefined;
      }
      const { err, response, isDisposed } = message;
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
   * 发布（请求-响应式）消息，流程：
   * 1. 分配唯一 id、规范化 pattern（即 NATS subject）、序列化请求包；
   * 2. 创建一次性 inbox 作为回复地址，并订阅该 inbox（回调为 createSubscriptionHandler）；
   * 3. 向 subject 发布消息（携带 reply: inbox 与合并后的 headers）；
   * 4. 返回取消订阅的清理函数。
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
      const channel = this.normalizePattern(partialPacket.pattern);
      const serializedPacket: NatsRecord = this.serializer.serialize(packet);
      const inbox = natsPackage.createInbox(this.options.inboxPrefix);

      const subscriptionHandler = this.createSubscriptionHandler(
        packet,
        callback,
      );

      const subscription = this.natsClient!.subscribe(inbox, {
        callback: subscriptionHandler,
      });

      const headers = this.mergeHeaders(serializedPacket.headers);
      this.natsClient!.publish(channel, serializedPacket.data, {
        reply: inbox,
        headers,
      });

      return () => subscription.unsubscribe();
    } catch (err) {
      callback({ err });
      return () => {};
    }
  }

  /**
   * 发送事件（不等待响应）：规范化 subject、序列化、合并 headers 后直接发布。
   * @param packet - 事件包
   * @returns 发布完成的 Promise
   */
  protected dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const serializedPacket: NatsRecord = this.serializer.serialize(packet);
    const headers = this.mergeHeaders(serializedPacket.headers);

    return new Promise<void>((resolve, reject) => {
      try {
        this.natsClient!.publish(pattern, serializedPacket.data, {
          headers,
        });
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 初始化序列化器：优先使用 options.serializer，否则默认 NatsRecordSerializer。
   * @param options - NATS 客户端选项
   */
  protected initializeSerializer(options: NatsOptions['options']) {
    this.serializer = options?.serializer ?? new NatsRecordSerializer();
  }

  /**
   * 初始化反序列化器：优先使用 options.deserializer，否则默认 NatsResponseJSONDeserializer。
   * @param options - NATS 客户端选项
   */
  protected initializeDeserializer(options: NatsOptions['options']) {
    this.deserializer =
      options?.deserializer ?? new NatsResponseJSONDeserializer();
  }

  /**
   * 合并请求级 headers 与全局 options.headers（请求级优先，已存在的键不覆盖）。
   * @param requestHeaders - 请求自带的 headers（可选）
   * @returns 合并后的 headers，或两者均无时返回 undefined
   */
  protected mergeHeaders<THeaders = any>(requestHeaders?: THeaders) {
    if (!requestHeaders && !this.options?.headers) {
      return undefined;
    }

    const headers = requestHeaders ?? natsPackage.headers();

    for (const [key, value] of Object.entries(this.options?.headers || {})) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }

    return headers;
  }
}
