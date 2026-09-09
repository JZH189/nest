import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { EmptyError, fromEvent, lastValueFrom, merge, Observable } from 'rxjs';
import { first, map, share, tap } from 'rxjs/operators';
import { ECONNREFUSED, ENOTFOUND, MQTT_DEFAULT_URL } from '../constants';
import { MqttEvents, MqttEventsMap, MqttStatus } from '../events/mqtt.events';
import { MqttOptions, ReadPacket, WritePacket } from '../interfaces';
import {
  MqttRecord,
  MqttRecordOptions,
} from '../record-builders/mqtt.record-builder';
import { MqttRecordSerializer } from '../serializers/mqtt-record.serializer';
import { ClientProxy } from './client-proxy';

let mqttPackage: any = {};

// To enable type safety for MQTT. This cant be uncommented by default
// because it would require the user to install the mqtt package even if they dont use MQTT
// Otherwise, TypeScript would fail to compile the code.
//
// type MqttClient = import('mqtt').MqttClient;
type MqttClient = any;

/**
 * 基于 MQTT 的客户端实现（ClientProxy 的子类）。
 * 通过 mqtt 包连接 broker，请求-响应通过订阅 `{pattern}/reply` 响应主题实现，
 * 事件式通信直接向 pattern 主题发布消息。支持 MQTT 主题通配符（+/#）。
 * 依赖 mqtt 包，首次使用时才动态加载。
 *
 * @publicApi
 */
export class ClientMqtt extends ClientProxy<MqttEvents, MqttStatus> {
  protected readonly logger = new Logger(ClientProxy.name);
  /** 各响应主题当前的订阅数（引用计数，归零时退订） */
  protected readonly subscriptionsCount = new Map<string, number>();
  /** broker 连接地址 */
  protected readonly url: string;
  /* eslint-disable @typescript-eslint/no-redundant-type-constituents */
  /** MQTT 客户端实例（未连接时为 null） */
  protected mqttClient: MqttClient | null = null;
  /** 复用中的连接 Promise */
  protected connectionPromise: Promise<any> | null = null;
  /** 是否已完成首次连接（决定 message 回调只注册一次） */
  protected isInitialConnection = false;
  /** 是否处于重连中 */
  protected isReconnecting = false;
  /** 连接建立前注册的事件监听器缓存 */
  protected pendingEventListeners: Array<{
    event: keyof MqttEvents;
    callback: MqttEvents[keyof MqttEvents];
  }> = [];

  /**
   * @param options - MQTT 客户端选项（url、userProperties 等）
   */
  constructor(protected readonly options: Required<MqttOptions>['options']) {
    super();
    this.url = this.getOptionsProp(this.options, 'url') ?? MQTT_DEFAULT_URL;

    mqttPackage = loadPackage('mqtt', ClientMqtt.name, () => require('mqtt'));

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 获取请求（发布消息）使用的主题名，默认原样返回 pattern。
   * @param pattern - 规范化后的模式字符串
   * @returns 请求主题名
   */
  public getRequestPattern(pattern: string): string {
    return pattern;
  }

  /**
   * 获取响应（订阅）使用的主题名：在请求主题后追加 "/reply"。
   * @param pattern - 规范化后的模式字符串
   * @returns 响应主题名
   */
  public getResponsePattern(pattern: string): string {
    return `${pattern}/reply`;
  }

  /**
   * 结束 MQTT 连接并清理状态与缓存监听器。
   */
  public async close() {
    if (this.mqttClient) {
      await this.mqttClient.endAsync();
    }
    this.mqttClient = null;
    this.connectionPromise = null;
    this.pendingEventListeners = [];
  }

  /**
   * 连接 MQTT broker，流程：
   * 1. 已有客户端实例则复用 connectionPromise；
   * 2. 创建客户端并注册错误/离线/重连/连接/断开/关闭六类监听器；
   * 3. 补挂缓存的监听器；
   * 4. 将 connect$ 与 close 事件合并为连接结果流，转为 Promise 缓存后返回。
   * @returns 连接完成的 Promise
   */
  public connect(): Promise<any> {
    if (this.mqttClient) {
      return this.connectionPromise!;
    }
    this.mqttClient = this.createClient();
    this.registerErrorListener(this.mqttClient);
    this.registerOfflineListener(this.mqttClient);
    this.registerReconnectListener(this.mqttClient);
    this.registerConnectListener(this.mqttClient);
    this.registerDisconnectListener(this.mqttClient);
    this.registerCloseListener(this.mqttClient);

    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.mqttClient!.on(event, callback),
    );
    this.pendingEventListeners = [];

    const connect$ = this.connect$(this.mqttClient);
    this.connectionPromise = lastValueFrom(
      this.mergeCloseEvent(this.mqttClient, connect$).pipe(share()),
    ).catch(err => {
      if (err instanceof EmptyError) {
        return;
      }
      throw err;
    });
    return this.connectionPromise;
  }

  /**
   * 把 close 事件并入连接流：close 触发时推送 CLOSED 状态并抛错结束（取先到者）。
   * @param instance - MQTT 客户端
   * @param source$ - 原连接流
   * @returns 合并后的连接流
   */
  public mergeCloseEvent<T = any>(
    instance: MqttClient,
    source$: Observable<T>,
  ): Observable<T> {
    const close$ = fromEvent(instance, MqttEventsMap.CLOSE).pipe(
      tap({
        next: () => {
          this._status$.next(MqttStatus.CLOSED);
        },
      }),
      map((err: any) => {
        throw err;
      }),
    );
    return merge(source$, close$).pipe(first());
  }

  /**
   * 创建 MQTT 客户端（连接 url 与用户 options）。
   * @returns MQTT 客户端实例
   */
  public createClient(): MqttClient {
    return mqttPackage.connect(this.url, this.options as MqttOptions);
  }

  /**
   * 注册错误监听器：ECONNREFUSED / ENOTFOUND 忽略（由重连机制处理），其余记日志。
   * @param client - MQTT 客户端
   */
  public registerErrorListener(client: MqttClient) {
    client.on(MqttEventsMap.ERROR, (err: any) => {
      if (err.code === ECONNREFUSED || err.code === ENOTFOUND) {
        return;
      }
      this.logger.error(err);
    });
  }

  /**
   * 注册离线监听器：置空 connectionPromise（表示连接丢失）并记日志。
   * @param client - MQTT 客户端
   */
  public registerOfflineListener(client: MqttClient) {
    client.on(MqttEventsMap.OFFLINE, () => {
      this.connectionPromise = Promise.reject(
        'Error: Connection lost. Trying to reconnect...',
      );

      // Prevent unhandled rejections
      this.connectionPromise.catch(() => {});
      this.logger.error('MQTT broker went offline.');
    });
  }

  /**
   * 注册重连监听器：标记重连中、推送 RECONNECTING 状态。
   * @param client - MQTT 客户端
   */
  public registerReconnectListener(client: MqttClient) {
    client.on(MqttEventsMap.RECONNECT, () => {
      this.isReconnecting = true;
      this._status$.next(MqttStatus.RECONNECTING);

      this.logger.log('MQTT connection lost. Trying to reconnect...');
    });
  }

  /**
   * 注册断开监听器：推送 DISCONNECTED 状态。
   * @param client - MQTT 客户端
   */
  public registerDisconnectListener(client: MqttClient) {
    client.on(MqttEventsMap.DISCONNECT, () => {
      this._status$.next(MqttStatus.DISCONNECTED);
    });
  }

  /**
   * 注册关闭监听器：推送 CLOSED 状态。
   * @param client - MQTT 客户端
   */
  public registerCloseListener(client: MqttClient) {
    client.on(MqttEventsMap.CLOSE, () => {
      this._status$.next(MqttStatus.CLOSED);
    });
  }

  /**
   * 注册连接成功监听器：清除重连标记、推送 CONNECTED 状态、恢复 connectionPromise；
   * 首次连接成功时在客户端上注册 'message' 回调（createResponseCallback）处理响应。
   * @param client - MQTT 客户端
   */
  public registerConnectListener(client: MqttClient) {
    client.on(MqttEventsMap.CONNECT, () => {
      this.isReconnecting = false;
      this._status$.next(MqttStatus.CONNECTED);

      this.logger.log('Connected to MQTT broker');
      this.connectionPromise = Promise.resolve();

      if (!this.isInitialConnection) {
        this.isInitialConnection = true;
        client.on('message', this.createResponseCallback());
      }
    });
  }

  /**
   * 注册底层客户端事件监听器；尚未连接时先缓存，连接后补挂。
   * @param event - 事件名
   * @param callback - 事件回调
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
   * 获取底层 MQTT 客户端实例。
   * @returns MQTT 客户端实例（未连接时抛出错误）
   */
  public unwrap<T>(): T {
    if (!this.mqttClient) {
      throw new Error(
        'Not initialized. Please call the "connect" method first.',
      );
    }
    return this.mqttClient as T;
  }

  /**
   * 创建订阅消息回调：解析 JSON -> 反序列化 -> 按 id 从 routingMap
   * 找到对应回调并触发（isDisposed 或 err 时结束对应 Observable）。
   * @returns 'message' 事件的回调函数
   */
  public createResponseCallback(): (channel: string, buffer: Buffer) => any {
    return async (channel: string, buffer: Buffer) => {
      const packet = JSON.parse(buffer.toString());
      const { err, response, isDisposed, id } =
        await this.deserializer.deserialize(packet);

      const callback = this.routingMap.get(id);
      if (!callback) {
        return undefined;
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
   * 发布（请求-响应式）消息到 MQTT 主题，流程：
   * 1. 分配唯一 id、规范化 pattern、计算响应主题（pattern/reply）；
   * 2. 该响应主题无订阅时先订阅（成功后再发布）；
   * 3. 发布时递增订阅计数、登记 id -> 回调，从数据中剥离 MqttRecord options 后
   *    序列化并发布到请求主题（合并 packet options）；
   * 4. 返回清理函数（递减订阅计数、归零退订，并删除路由映射）。
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
      const responseChannel = this.getResponsePattern(pattern);

      let subscriptionsCount =
        this.subscriptionsCount.get(responseChannel) || 0;

      const publishPacket = () => {
        subscriptionsCount = this.subscriptionsCount.get(responseChannel) || 0;
        this.subscriptionsCount.set(responseChannel, subscriptionsCount + 1);
        this.routingMap.set(packet.id, callback);

        const options =
          isObject(packet?.data) && packet.data instanceof MqttRecord
            ? packet.data.options
            : undefined;
        delete packet?.data?.options;
        const serializedPacket: string | Buffer =
          this.serializer.serialize(packet);

        this.mqttClient!.publish(
          this.getRequestPattern(pattern),
          serializedPacket,
          this.mergePacketOptions(options),
        );
      };

      if (subscriptionsCount <= 0) {
        this.mqttClient!.subscribe(
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
   * 发送事件（不等待响应）：剥离 MqttRecord options、序列化后向主题发布，
   * 发布回调决定 resolve/reject。
   * @param packet - 事件包
   * @returns 发布完成的 Promise
   */
  protected dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const options =
      isObject(packet?.data) && packet.data instanceof MqttRecord
        ? packet.data.options
        : undefined;
    delete packet?.data?.options;

    const serializedPacket: string | Buffer = this.serializer.serialize(packet);
    return new Promise<void>((resolve, reject) =>
      this.mqttClient!.publish(
        pattern,
        serializedPacket,
        this.mergePacketOptions(options),
        (err: any) => (err ? reject(err) : resolve()),
      ),
    );
  }

  /**
   * 递减主题订阅计数，归零（及以下）时真正退订该主题。
   * @param channel - 响应主题名
   */
  protected unsubscribeFromChannel(channel: string) {
    const subscriptionCount = this.subscriptionsCount.get(channel)!;
    this.subscriptionsCount.set(channel, subscriptionCount - 1);

    if (subscriptionCount - 1 <= 0) {
      this.mqttClient!.unsubscribe(channel);
    }
  }

  /**
   * 初始化序列化器：优先使用 options.serializer，否则默认 MqttRecordSerializer。
   * @param options - MQTT 客户端选项
   */
  protected initializeSerializer(options: MqttOptions['options']) {
    this.serializer = options?.serializer ?? new MqttRecordSerializer();
  }

  /**
   * 合并请求级 MqttRecord options 与全局 userProperties：
   * userProperties 深度合并（请求级优先），且避免生成空对象导致消息被丢弃。
   * @param requestOptions - 请求自带的 MqttRecord options（可选）
   * @returns 合并后的发布选项，两者均无时为 undefined
   */
  protected mergePacketOptions(
    requestOptions?: MqttRecordOptions,
  ): MqttRecordOptions | undefined {
    if (!requestOptions && !this.options?.userProperties) {
      return undefined;
    }

    // Cant just spread objects as MQTT won't deliver
    // any message with empty object as "userProperties" field
    // @url https://github.com/nestjs/nest/issues/14079
    let options: MqttRecordOptions = {};
    if (requestOptions) {
      options = { ...requestOptions };
    }
    if (this.options?.userProperties) {
      options.properties = {
        ...options.properties,
        userProperties: {
          ...this.options?.userProperties,
          ...options.properties?.userProperties,
        },
      };
    }
    return options;
  }
}
