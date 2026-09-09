import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { isNil } from '@nestjs/common/utils/shared.utils';
import {
  throwError as _throw,
  connectable,
  defer,
  fromEvent,
  merge,
  Observable,
  Observer,
  ReplaySubject,
  Subject,
} from 'rxjs';
import { distinctUntilChanged, map, mergeMap, take } from 'rxjs/operators';
import { IncomingResponseDeserializer } from '../deserializers/incoming-response.deserializer';
import { InvalidMessageException } from '../errors/invalid-message.exception';
import {
  ClientOptions,
  KafkaOptions,
  MqttOptions,
  MsPattern,
  NatsOptions,
  PacketId,
  ReadPacket,
  RedisOptions,
  RmqOptions,
  TcpClientOptions,
  WritePacket,
} from '../interfaces';
import { ProducerDeserializer } from '../interfaces/deserializer.interface';
import { ProducerSerializer } from '../interfaces/serializer.interface';
import { IdentitySerializer } from '../serializers/identity.serializer';
import { transformPatternToRoute } from '../utils';

/**
 * ClientProxy 是所有微服务客户端的抽象基类，是“消息发送端”的统一抽象。
 *
 * 对使用者提供两个核心 API：
 * - send()：请求-响应式通信（发送消息并等待远端 @MessagePattern 处理器的响应，返回 Observable）；
 * - emit()：事件式通信（发射事件给 @EventPattern 处理器，不等待响应，fire-and-forget）。
 *
 * 具体传输实现（ClientTCP、ClientKafka、ClientNATS、ClientRedis、ClientMqtt、
 * ClientRMQ、ClientGrpc）只需实现 connect()/close()/publish()/dispatchEvent() 等抽象方法，
 * 即可复用这里定义的连接管理、消息序列化与响应回调机制。
 *
 * @publicApi
 */
export abstract class ClientProxy<
  EventsMap extends Record<never, Function> = Record<never, Function>,
  Status extends string = string,
> {
  /** 路由映射表：记录已发出的消息 id 与其响应回调的对应关系（按传输层实现使用） */
  protected routingMap = new Map<string, Function>();
  /** 消息序列化器：把待发送的 packet 转为底层协议可传输的格式 */
  protected serializer: ProducerSerializer;
  /** 响应反序列化器：把底层协议收到的原始响应转为 WritePacket */
  protected deserializer: ProducerDeserializer;
  /** 内部 ReplaySubject，用于向外部发布连接状态变化 */
  protected _status$ = new ReplaySubject<Status>(1);

  /**
   * Returns an observable that emits status changes.
   */
  public get status(): Observable<Status> {
    return this._status$.asObservable().pipe(distinctUntilChanged());
  }

  /**
   * Establishes the connection to the underlying server/broker.
   */
  public abstract connect(): Promise<any>;
  /**
   * Closes the underlying connection to the server/broker.
   */
  public abstract close(): any;
  /**
   * Registers an event listener for the given event.
   * @param event Event name
   * @param callback Callback to be executed when the event is emitted
   */
  public on<
    EventKey extends keyof EventsMap = keyof EventsMap,
    EventCallback extends EventsMap[EventKey] = EventsMap[EventKey],
  >(event: EventKey, callback: EventCallback) {
    throw new Error('Method not implemented.');
  }
  /**
   * Returns an instance of the underlying server/broker instance,
   * or a group of servers if there are more than one.
   */
  public abstract unwrap<T>(): T;

  /**
   * 发送消息给服务端/broker，请求-响应式通信的核心方法。流程：
   * 1. 校验 pattern 与 data 是否为空，为空则返回抛出 InvalidMessageException 的 Observable；
   * 2. defer 中懒执行 connect()（首次订阅时才建立连接）；
   * 3. 创建一个 Observable，订阅时把 observer 包装成响应回调，
   *    交给子类的 publish() 实际发出消息并注册回调。
   * @param pattern - 标识消息的模式（字符串或对象）
   * @param data - 要发送的数据
   * @returns 发出响应结果的 Observable
   */
  public send<TResult = any, TInput = any>(
    pattern: any,
    data: TInput,
  ): Observable<TResult> {
    if (isNil(pattern) || isNil(data)) {
      return _throw(() => new InvalidMessageException());
    }
    return defer(async () => this.connect()).pipe(
      mergeMap(
        () =>
          new Observable((observer: Observer<TResult>) => {
            const callback = this.createObserver(observer);
            return this.publish({ pattern, data }, callback);
          }),
      ),
    );
  }

  /**
   * 发射事件给服务端/broker，事件式通信的核心方法。流程：
   * 1. 校验 pattern 与 data 是否为空；
   * 2. defer 中懒连接后调用子类的 dispatchEvent() 发出事件（不等待响应）；
   * 3. 用 connectable() 将源变为“热”Observable，立即执行一次并缓存结果，
   *    保证多个订阅者不会重复发送事件。
   * @param pattern - 标识事件的模式
   * @param data - 事件携带的数据
   * @returns 事件成功发出后即完成的 Observable
   */
  public emit<TResult = any, TInput = any>(
    pattern: any,
    data: TInput,
  ): Observable<TResult> {
    if (isNil(pattern) || isNil(data)) {
      return _throw(() => new InvalidMessageException());
    }
    const source = defer(async () => this.connect()).pipe(
      mergeMap(() => this.dispatchEvent({ pattern, data })),
    );
    const connectableSource = connectable(source, {
      connector: () => new Subject(),
      resetOnDisconnect: false,
    });
    connectableSource.connect();
    return connectableSource;
  }

  /**
   * 发布（请求-响应式）消息的抽象方法，由各传输层子类实现：
   * 发出 packet 并注册响应回调，返回一个“取消订阅/清理”函数。
   * @param packet - 待发送的请求包（含 pattern 与 data）
   * @param callback - 收到响应包（WritePacket）时的回调
   * @returns 取消订阅的清理函数
   */
  protected abstract publish(
    packet: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void;

  /**
   * 发送事件（无响应）的抽象方法，由各传输层子类实现。
   * @param packet - 待发送的事件包
   * @returns 事件发送完成的 Promise
   */
  protected abstract dispatchEvent<T = any>(packet: ReadPacket): Promise<T>;

  /**
   * 把 RxJS Observer 适配为传输层回调函数：根据响应包中的
   * err / response / isDisposed 决定向 observer 推送 error、next 还是 complete。
   * @param observer - send() 返回的 Observable 的观察者
   * @returns 供 publish() 使用的响应包回调
   */
  protected createObserver<T>(
    observer: Observer<T>,
  ): (packet: WritePacket) => void {
    return ({ err, response, isDisposed }: WritePacket) => {
      if (err) {
        return observer.error(this.serializeError(err));
      } else if (response !== undefined && isDisposed) {
        observer.next(this.serializeResponse(response));
        return observer.complete();
      } else if (isDisposed) {
        return observer.complete();
      }
      observer.next(this.serializeResponse(response));
    };
  }

  /** 序列化错误（子类可覆盖，例如 gRPC 中转换为 RpcException） */
  protected serializeError(err: any): any {
    return err;
  }

  /** 序列化响应（子类可覆盖以做响应预处理） */
  protected serializeResponse(response: any): any {
    return response;
  }

  /**
   * 为请求包生成随机唯一 id（用于匹配响应与待处理请求）。
   * @param packet - 待发送的请求包
   * @returns 附加了 id 的请求包
   */
  protected assignPacketId(packet: ReadPacket): ReadPacket & PacketId {
    const id = randomStringGenerator();
    return Object.assign(packet, { id });
  }

  /**
   * 把基于事件的底层实例（socket / nats client 等）封装成连接 Observable：
   * 合并 error 事件（转为错误）与 connect 事件，任一先到即完成（take(1)）。
   * @param instance - 底层连接实例（EventEmitter）
   * @param errorEvent - 错误事件名，默认 'error'
   * @param connectEvent - 连接成功事件名，默认 'connect'
   * @returns 连接成功或失败（取先到者）的 Observable
   */
  protected connect$(
    instance: any,
    errorEvent = 'error',
    connectEvent = 'connect',
  ): Observable<any> {
    const error$ = fromEvent(instance, errorEvent).pipe(
      map((err: any) => {
        throw err;
      }),
    );
    const connect$ = fromEvent(instance, connectEvent);
    return merge(error$, connect$).pipe(take(1));
  }

  /**
   * 安全读取 options 中的属性，未设置时返回默认值（重载支持省略默认值）。
   * @param obj - 客户端 options 对象
   * @param prop - 属性名
   * @param defaultValue - 属性不存在时的默认值
   * @returns 属性值或默认值
   */
  protected getOptionsProp<
    Options extends ClientOptions['options'],
    Attribute extends keyof Options,
  >(obj: Options, prop: Attribute): Options[Attribute];
  protected getOptionsProp<
    Options extends ClientOptions['options'],
    Attribute extends keyof Options,
    DefaultValue extends Options[Attribute] = Options[Attribute],
  >(
    obj: Options,
    prop: Attribute,
    defaultValue: DefaultValue,
  ): Required<Options>[Attribute];
  protected getOptionsProp<
    Options extends ClientOptions['options'],
    Attribute extends keyof Options,
    DefaultValue extends Options[Attribute] = Options[Attribute],
  >(
    obj: Options,
    prop: Attribute,
    defaultValue: DefaultValue = undefined as DefaultValue,
  ) {
    return obj && prop in obj ? (obj as any)[prop] : defaultValue;
  }

  /**
   * 将消息模式（字符串或对象）规范化为路由字符串，如 { cmd: 'sum' } -> '/sum/cmd/sum'。
   * @param pattern - 消息模式
   * @returns 规范化后的路由字符串
   */
  protected normalizePattern(pattern: MsPattern): string {
    return transformPatternToRoute(pattern);
  }

  /**
   * 初始化消息序列化器：优先使用 options.serializer，否则默认 IdentitySerializer（原样透传）。
   * @param options - 客户端 options
   */
  protected initializeSerializer(options: ClientOptions['options']) {
    this.serializer =
      (options &&
        (options as
          | RedisOptions['options']
          | NatsOptions['options']
          | MqttOptions['options']
          | TcpClientOptions['options']
          | RmqOptions['options']
          | KafkaOptions['options'])!.serializer) ||
      new IdentitySerializer();
  }

  /**
   * 初始化响应反序列化器：优先使用 options.deserializer，
   * 否则默认 IncomingResponseDeserializer。
   * @param options - 客户端 options
   */
  protected initializeDeserializer(options: ClientOptions['options']) {
    this.deserializer =
      (options &&
        (options as
          | RedisOptions['options']
          | NatsOptions['options']
          | MqttOptions['options']
          | TcpClientOptions['options']
          | RmqOptions['options']
          | KafkaOptions['options'])!.deserializer) ||
      new IncomingResponseDeserializer();
  }
}
