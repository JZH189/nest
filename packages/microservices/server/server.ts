import { Logger, LoggerService } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import {
  connectable,
  EMPTY,
  from as fromPromise,
  isObservable,
  Observable,
  ObservedValueOf,
  of,
  ReplaySubject,
  Subject,
  Subscription,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  finalize,
  mergeMap,
} from 'rxjs/operators';
import { NO_EVENT_HANDLER } from '../constants';
import { BaseRpcContext } from '../ctx-host/base-rpc.context';
import { IncomingRequestDeserializer } from '../deserializers/incoming-request.deserializer';
import { Transport } from '../enums';
import {
  ClientOptions,
  KafkaOptions,
  MessageHandler,
  MicroserviceOptions,
  MqttOptions,
  MsPattern,
  NatsOptions,
  ReadPacket,
  RedisOptions,
  RmqOptions,
  TcpOptions,
  WritePacket,
} from '../interfaces';
import { ConsumerDeserializer } from '../interfaces/deserializer.interface';
import { ConsumerSerializer } from '../interfaces/serializer.interface';
import { IdentitySerializer } from '../serializers/identity.serializer';
import { transformPatternToRoute } from '../utils';

/**
 * 所有微服务传输层服务端（ServerTCP、ServerKafka、ServerNATS 等）的抽象基类。
 *
 * 职责：
 * 1. 维护「消息模式 (pattern) -> 处理器 (MessageHandler)」的注册表，
 *    即 @MessagePattern() / @EventPattern() 装饰器扫描后注册的处理器容器；
 * 2. 定义各传输实现必须遵守的生命周期契约：listen()（开始监听）、
 *    close()（关闭服务）、on()（注册底层连接事件）、unwrap()（暴露底层实例）；
 * 3. 提供通用的消息分发与响应能力：handleEvent() 分发事件消息，
 *    send() 把处理器的响应流安全地回发给客户端；
 * 4. 提供序列化器/反序列化器的初始化、选项读取、错误处理等公共工具方法。
 *
 * 泛型参数：
 * @typeParam EventsMap - 底层库事件名到回调签名的映射，用于约束 on() 方法。
 * @typeParam Status - 服务器状态字符串字面量类型，通过 status 可观察对象对外暴露。
 *
 * @publicApi
 */
export abstract class Server<
  EventsMap extends Record<string, Function> = Record<string, Function>,
  Status extends string = string,
> {
  /**
   * 唯一的传输标识符。
   */
  public transportId?: Transport | symbol;

  /**
   * 消息处理器注册表：键为归一化后的消息模式路由字符串，
   * 值为对应的处理函数（@MessagePattern/@EventPattern 标注的方法）。
   * 同一模式下多个事件处理器会通过 handler.next 链表串联。
   */
  protected readonly messageHandlers = new Map<string, MessageHandler>();
  /** 内部日志器，用于输出服务器运行日志。 */
  protected readonly logger: LoggerService = new Logger(Server.name);
  /** 消息序列化器：把响应数据（WritePacket）转换为传输层可发送的格式。 */
  protected serializer: ConsumerSerializer;
  /** 消息反序列化器：把传输层收到的原始数据解析为 ReadPacket。 */
  protected deserializer: ConsumerDeserializer;
  /** 请求处理开始前的钩子（默认直接放行），常用于链路追踪等横切逻辑。 */
  protected onProcessingStartHook: (
    transportId: Transport | symbol,
    context: BaseRpcContext,
    done: () => Promise<any>,
  ) => void = (
    transportId: Transport | symbol,
    context: BaseRpcContext,
    done: () => Promise<any>,
  ) => done();
  /** 请求处理结束后的钩子（默认未启用）。 */
  protected onProcessingEndHook: (
    transportId: Transport | symbol,
    context: BaseRpcContext,
  ) => void;
  /** 状态回放主体：记录最近一次状态，新订阅者可立即获取当前状态。 */
  protected _status$ = new ReplaySubject<Status>(1);

  /**
   * 返回一个发出状态变化的可观察对象。
   */
  public get status(): Observable<Status> {
    return this._status$.asObservable().pipe(distinctUntilChanged());
  }

  /**
   * 为给定事件注册事件监听器。
   * @param event 事件名称
   * @param callback 事件发出时执行的回调函数
   */
  public abstract on<
    EventKey extends keyof EventsMap = keyof EventsMap,
    EventCallback extends EventsMap[EventKey] = EventsMap[EventKey],
  >(event: EventKey, callback: EventCallback): any;

  /**
   * 返回底层服务器/代理实例的实例，
   * 如果有多个则返回服务器组。
   */
  public abstract unwrap<T>(): T;

  /**
   * 服务器初始化时调用的方法。
   * @param callback 初始化时调用的函数
   */
  public abstract listen(callback: (...optionalParams: unknown[]) => any): any;

  /**
   * 服务器终止时调用的方法。
   */
  public abstract close(): any;

  /**
   * 设置传输标识符。
   * @param transportId 唯一的传输标识符。
   */
  public setTransportId(transportId: Transport | symbol): void {
    this.transportId = transportId;
  }

  /**
   * 设置处理开始时调用的钩子。
   */
  public setOnProcessingStartHook(
    hook: (
      transportId: Transport | symbol,
      context: unknown,
      done: () => Promise<any>,
    ) => void,
  ): void {
    this.onProcessingStartHook = hook;
  }

  /**
   * 设置处理结束时调用的钩子。
   */
  public setOnProcessingEndHook(
    hook: (transportId: Transport | symbol, context: unknown) => void,
  ): void {
    this.onProcessingEndHook = hook;
  }

  /**
   * 注册消息处理器（由 @MessagePattern/@EventPattern 装饰器的扫描结果调用）。
   *
   * 处理逻辑：
   * 1. 把消息模式归一化为统一的路由字符串作为注册表的键；
   * 2. 在处理函数上记录 isEventHandler（是否为事件处理器）与 extras 元数据；
   * 3. 若同一模式已存在处理器且当前注册的是事件处理器，则将其追加到
   *    处理器链表尾部（同一 pattern 可绑定多个 @EventPattern 处理器，依次执行）；
   * 4. 否则直接写入注册表（@MessagePattern 同一模式只保留一个处理器）。
   *
   * @param pattern 消息模式（可以是字符串、数字或嵌套对象字面量）
   * @param callback 消息处理器函数
   * @param isEventHandler 是否为事件处理器（@EventPattern），默认 false
   * @param extras 附加元数据（如超时时间、发布版本等）
   */
  public addHandler(
    pattern: any,
    callback: MessageHandler,
    isEventHandler = false,
    extras: Record<string, any> = {},
  ) {
    // 1. 将 pattern 归一化为路由字符串（对象会被序列化成固定键值的字符串）
    const normalizedPattern = this.normalizePattern(pattern);
    // 2. 把元数据挂载到处理函数本身，便于运行时读取
    callback.isEventHandler = isEventHandler;
    callback.extras = extras;

    // 3. 同一 pattern 已有处理器且本次注册的是事件处理器时，追加到链表尾部
    if (this.messageHandlers.has(normalizedPattern) && isEventHandler) {
      const headRef = this.messageHandlers.get(normalizedPattern)!;
      const getTail = (handler: MessageHandler) =>
        handler?.next ? getTail(handler.next) : handler;

      const tailRef = getTail(headRef);
      tailRef.next = callback;
    } else {
      // 4. 常规情况：直接覆盖/写入注册表
      this.messageHandlers.set(normalizedPattern, callback);
    }
  }

  /**
   * 获取全部已注册的消息处理器注册表。
   * @returns 键为路由字符串、值为 MessageHandler 的 Map
   */
  public getHandlers(): Map<string, MessageHandler> {
    return this.messageHandlers;
  }

  /**
   * 按消息模式查找对应的处理器。
   * @param pattern 字符串形式的消息模式
   * @returns 找到的处理器；未注册该模式时返回 null
   */
  public getHandlerByPattern(pattern: string): MessageHandler | null {
    const route = this.getRouteFromPattern(pattern);
    return this.messageHandlers.has(route)
      ? this.messageHandlers.get(route)!
      : null;
  }

  /**
   * 把处理器返回的响应流（Observable）安全地回发给客户端。
   *
   * 核心难点：响应可能产生多个数据包（多值流 + 错误 + 结束标记），
   * 而底层传输（如 TCP socket）通常不支持并发写。因此这里用一个
   * 「数据队列 + process.nextTick」把发送操作串行化，保证顺序写且不丢失。
   *
   * @param stream$ 处理器返回的响应流（可发出 0..n 个值，随后可能出错或完成）
   * @param respond 实际执行回发的函数（由各传输实现提供，接收 WritePacket）
   * @returns 订阅句柄，可用于取消订阅
   */
  public send(
    stream$: Observable<any>,
    respond: (data: WritePacket) => Promise<unknown> | void,
  ): Subscription {
    // 1. 待发送的数据包队列，实现发送的串行化
    const dataQueue: WritePacket[] = [];
    let isProcessing = false;
    const scheduleOnNextTick = (data: WritePacket) => {
      // 2. 结束标记（isDisposed）永远代表流终止，需保证它排在队列最后
      if (data.isDisposed && dataQueue.length > 0) {
        dataQueue[dataQueue.length - 1].isDisposed = true;
      } else {
        dataQueue.push(data);
      }
      // 3. 若当前没有正在进行的排空任务，则在 nextTick 中按序发送全部数据包
      if (!isProcessing) {
        isProcessing = true;
        process.nextTick(async () => {
          while (dataQueue.length > 0) {
            const packet = dataQueue.shift();
            if (packet) {
              await respond(packet);
            }
          }
          isProcessing = false;
        });
      }
    };
    // 4. 订阅响应流：正常值、错误、完成（finalize）分别包装成 WritePacket 入队
    return stream$
      .pipe(
        catchError((err: any) => {
          scheduleOnNextTick({ err });
          return EMPTY;
        }),
        finalize(() => scheduleOnNextTick({ isDisposed: true })),
      )
      .subscribe((response: any) => scheduleOnNextTick({ response }));
  }

  /**
   * 处理事件消息（@EventPattern 声明的事件处理器走此通道，无需回发响应）。
   *
   * 处理逻辑：
   * 1. 按模式查找事件处理器，找不到则记录错误日志（NO_EVENT_HANDLER）；
   * 2. 通过 onProcessingStartHook 包装执行（支持请求开始的横切逻辑）；
   * 3. 执行处理器，若返回值是 Observable，则用 connectable 保持热订阅
   *    （即使无人订阅也立即执行），并在流结束时触发 onProcessingEndHook；
   * 4. 若返回普通值/Promise，则同步触发 onProcessingEndHook。
   *
   * @param pattern 字符串形式的消息模式
   * @param packet 反序列化后的入站消息（含 data）
   * @param context RPC 上下文（含 headers 等元信息，供处理器访问）
   * @returns 处理器执行结果（通常被忽略）
   */
  public async handleEvent(
    pattern: string,
    packet: ReadPacket,
    context: BaseRpcContext,
  ): Promise<any> {
    // 1. 查找对应模式的事件处理器
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      // 2. 未找到处理器：记录错误并放弃处理
      return this.logger.error(NO_EVENT_HANDLER`${pattern}`);
    }
    // 3. 在开始钩子内执行处理器，done 回调中承载真正的处理逻辑
    return this.onProcessingStartHook(this.transportId!, context, async () => {
      const resultOrStream = await handler(packet.data, context);
      if (isObservable(resultOrStream)) {
        // 4. 返回值是 Observable：转为可多播的热流并立即连接，避免重复执行副作用
        const connectableSource = connectable(
          resultOrStream.pipe(
            finalize(() =>
              this.onProcessingEndHook?.(this.transportId!, context),
            ),
          ),
          {
            connector: () => new Subject(),
            resetOnDisconnect: false,
          },
        );
        connectableSource.connect();
      } else {
        // 5. 返回值非 Observable：直接触发结束钩子
        this.onProcessingEndHook?.(this.transportId!, context);
      }
    });
  }

  /**
   * 把处理器的返回值（值、Promise 或 Observable）统一包装为 Observable，
   * 便于控制器/网关层用统一的响应式管道处理结果。
   * @param resultOrDeferred 任意返回值：普通值、Promise 或 Observable
   * @returns 包装后的 Observable
   */
  public transformToObservable<T>(
    resultOrDeferred: Observable<T> | Promise<T>,
  ): Observable<T>;
  public transformToObservable<T>(
    resultOrDeferred: T,
  ): never extends Observable<ObservedValueOf<T>>
    ? Observable<T>
    : Observable<ObservedValueOf<T>>;
  public transformToObservable(resultOrDeferred: any) {
    // 1. Promise：先转成流，若其解析结果又是 Observable 则展平
    if (resultOrDeferred instanceof Promise) {
      return fromPromise(resultOrDeferred).pipe(
        mergeMap(val => (isObservable(val) ? val : of(val))),
      );
    }

    // 2. 已经是 Observable：原样返回
    if (isObservable(resultOrDeferred)) {
      return resultOrDeferred;
    }

    // 3. 普通值：包装为单值 Observable
    return of(resultOrDeferred);
  }

  /**
   * 从传输层选项对象中读取指定属性（支持重载提供默认值）。
   * @param obj 传输层选项对象（如 TcpOptions['options']）
   * @param prop 要读取的属性名
   * @param defaultValue 可选的默认值，属性不存在时返回
   * @returns 属性值或默认值
   */
  public getOptionsProp<
    Options extends MicroserviceOptions['options'],
    Attribute extends keyof Options,
  >(obj: Options, prop: Attribute): Options[Attribute];
  public getOptionsProp<
    Options extends MicroserviceOptions['options'],
    Attribute extends keyof Options,
    DefaultValue extends Options[Attribute] = Options[Attribute],
  >(
    obj: Options,
    prop: Attribute,
    defaultValue: DefaultValue,
  ): Required<Options>[Attribute];
  public getOptionsProp<
    Options extends MicroserviceOptions['options'],
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
   * 记录错误日志（各传输实现捕获到异常时调用）。
   * @param error 错误信息
   */
  protected handleError(error: string) {
    this.logger.error(error);
  }

  /**
   * 按需加载第三方依赖包（延迟加载，避免未安装的包影响启动）。
   * @param name 包名（如 'kafkajs'、'amqplib'）
   * @param ctx 加载上下文（报错时提示在哪个功能中使用）
   * @param loader 可选的自定义加载函数
   * @returns 加载到的模块
   */
  protected loadPackage<T = any>(
    name: string,
    ctx: string,
    loader?: Function,
  ): T {
    return loadPackage(name, ctx, loader);
  }

  /**
   * 初始化消息序列化器：优先使用用户在 options.serializer 中配置的实现，
   * 否则回退为 IdentitySerializer（原样透传，不做转换）。
   * @param options 传输层选项
   */
  protected initializeSerializer(options: ClientOptions['options']) {
    this.serializer =
      (options &&
        (options as
          | RedisOptions['options']
          | NatsOptions['options']
          | MqttOptions['options']
          | TcpOptions['options']
          | RmqOptions['options']
          | KafkaOptions['options'])!.serializer) ||
      new IdentitySerializer();
  }

  /**
   * 初始化消息反序列化器：优先使用用户在 options.deserializer 中配置的实现，
   * 否则回退为 IncomingRequestDeserializer（解析入站请求的标准实现）。
   * @param options 传输层选项
   */
  protected initializeDeserializer(options: ClientOptions['options']) {
    this.deserializer =
      (options! &&
        (options as
          | RedisOptions['options']
          | NatsOptions['options']
          | MqttOptions['options']
          | TcpOptions['options']
          | RmqOptions['options']
          | KafkaOptions['options'])!.deserializer) ||
      new IncomingRequestDeserializer();
  }

  /**
   * Transforms the server Pattern to valid type and returns a route for him.
   *
   * @param  {string} pattern - server pattern
   * @returns string
   */
  /**
   * 把收到的字符串 pattern 还原为原始 pattern（对象或字面量），
   * 再归一化为路由字符串，用于在注册表中查找处理器。
   * @param pattern 字符串形式的 pattern
   * @returns 归一化后的路由字符串
   */
  protected getRouteFromPattern(pattern: string): string {
    let validPattern: MsPattern;

    try {
      // 1. 尝试把 JSON 字符串解析回对象 pattern
      validPattern = JSON.parse(pattern);
    } catch (error) {
      // Uses a fundamental object (`pattern` variable without any conversion)
      // 2. 解析失败说明 pattern 本身是字面量（如 "cmd:sum"），直接使用原值
      validPattern = pattern;
    }
    return this.normalizePattern(validPattern);
  }

  /**
   * 将 pattern（字符串/数字/对象）归一化为统一的路由字符串。
   * @param pattern 原始消息模式
   * @returns 归一化后的路由字符串
   */
  protected normalizePattern(pattern: MsPattern): string {
    return transformPatternToRoute(pattern);
  }
}
