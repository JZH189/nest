import {
  isObject,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import {
  EMPTY,
  Observable,
  ReplaySubject,
  Subject,
  Subscription,
  defaultIfEmpty,
  fromEvent,
  lastValueFrom,
} from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { GRPC_DEFAULT_PROTO_LOADER, GRPC_DEFAULT_URL } from '../constants';
import { GrpcMethodStreamingType } from '../decorators';
import { Transport } from '../enums';
import { InvalidGrpcPackageException } from '../errors/invalid-grpc-package.exception';
import { InvalidProtoDefinitionException } from '../errors/invalid-proto-definition.exception';
import { ChannelOptions } from '../external/grpc-options.interface';
import { getGrpcPackageDefinition } from '../helpers';
import { MessageHandler } from '../interfaces';
import {
  GrpcOptions,
  TransportId,
} from '../interfaces/microservice-configuration.interface';
import { Server } from './server';

const CANCELLED_EVENT = 'cancelled';

// To enable type safety for gRPC. This cant be uncommented by default
// because it would require the user to install the @grpc/grpc-js package even if they dont use gRPC
// Otherwise, TypeScript would fail to compile the code.
//
// type GrpcServer = import('@grpc/grpc-js').Server;
// let grpcPackage = {} as typeof import('@grpc/grpc-js');
// let grpcProtoLoaderPackage = {} as typeof import('@grpc/proto-loader');

type GrpcServer = any;
let grpcPackage = {} as any;
let grpcProtoLoaderPackage = {} as any;

/**
 * gRPC 调用对象的抽象描述：既包含一元调用的请求与元数据，
 * 也包含流式调用所需的 write/end/on 等流控制方法。
 *
 * @typeParam TRequest - 请求负载类型
 * @typeParam TMetadata - gRPC 元数据（metadata）类型
 */
interface GrpcCall<TRequest = any, TMetadata = any> {
  /** 一元调用的请求负载。 */
  request: TRequest;
  /** 调用携带的 gRPC 元数据。 */
  metadata: TMetadata;
  /** 发送响应元数据的函数。 */
  sendMetadata: Function;
  /** 结束可写流的函数。 */
  end: Function;
  /** 向流写入一个值的函数（服务端流式响应）。 */
  write: Function;
  /** 注册流事件监听器的函数（data/error/end/cancelled 等）。 */
  on: Function;
  /** 移除流事件监听器的函数。 */
  off: Function;
  /** 触发流事件的函数（如 error）。 */
  emit: Function;
}

/**
 * 基于 gRPC（@grpc/grpc-js + proto-loader）的微服务服务端实现。
 *
 * 工作方式：
 * - 启动时加载 .proto 文件生成包定义，遍历 proto 中的所有 service 定义，
 *   把每个 rpc 方法包装后通过 grpcClient.addService() 注册到底层 gRPC 服务器；
 * - 消息模式的匹配规则：@GrpcMethod/@GrpcStreamMethod 装饰器注册的 pattern
 *   形如 `{ service, rpc, streaming }`（JSON 字符串），gRPC 侧按
 *   「服务名 + 方法名 + 流类型」查找对应的处理器；
 * - 根据 proto 中 rpc 定义的 requestStream/responseStream 组合，
 *   选择一元、服务端流、客户端流（RX 流 / 直通流）等不同的包装方式回发响应。
 *
 * @publicApi
 */
export class ServerGrpc extends Server<never, never> {
  /** 传输器唯一标识：GRPC。 */
  public transportId: TransportId = Transport.GRPC;
  /** gRPC 服务器监听地址（默认 '0.0.0.0:5000'，见 GRPC_DEFAULT_URL）。 */
  protected readonly url: string;
  /** 底层 @grpc/grpc-js 的 Server 实例。 */
  protected grpcClient: GrpcServer;

  /**
   * gRPC 传输不支持状态流，访问即抛错。
   * @throws 始终抛出不支持错误
   */
  get status(): never {
    throw new Error(
      'The "status" attribute is not supported by the gRPC transport',
    );
  }

  /**
   * @param options gRPC 传输选项，包括 protoPath/package/url/protoLoader、
   * credentials、channelOptions、keepalive、maxSendMessageLength、
   * maxReceiveMessageLength、maxMetadataSize、gracefulShutdown、
   * onLoadPackageDefinition 等
   */
  constructor(private readonly options: Readonly<GrpcOptions>['options']) {
    super();
    // 1. 读取监听地址与 proto 加载器（默认 @grpc/proto-loader）
    this.url = this.getOptionsProp(options, 'url') || GRPC_DEFAULT_URL;

    const protoLoader =
      this.getOptionsProp(options, 'protoLoader') || GRPC_DEFAULT_PROTO_LOADER;

    // 2. 按需加载 @grpc/grpc-js 与 proto 加载器依赖
    grpcPackage = this.loadPackage('@grpc/grpc-js', ServerGrpc.name, () =>
      require('@grpc/grpc-js'),
    );
    grpcProtoLoaderPackage = this.loadPackage(
      protoLoader,
      ServerGrpc.name,
      () =>
        protoLoader === GRPC_DEFAULT_PROTO_LOADER
          ? require('@grpc/proto-loader')
          : require(protoLoader),
    );
  }

  /**
   * 启动 gRPC 服务器：创建底层服务器并绑定所有 proto 服务。
   * @param callback 启动完成或失败后调用的回调
   */
  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    try {
      // 1. 创建 gRPC 服务器实例（绑定端口）
      this.grpcClient = await this.createClient();
      // 2. 加载 proto 并把所有服务方法注册到服务器
      await this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * 启动流程第二步：绑定 proto 中定义的所有服务。
   * @param callback 启动完成后调用的回调
   */
  public async start(callback?: () => void) {
    await this.bindEvents();
    callback?.();
  }

  /**
   * 加载 proto 定义，并为配置中每个 package 找到对应的包对象，
   * 将其中的 service 与处理器绑定。
   */
  public async bindEvents() {
    // 1. 加载 .proto 文件生成 gRPC 包定义对象
    const grpcContext = this.loadProto();
    // 2. package 选项可以是单个名称或名称数组，统一处理为数组
    const packageOption = this.getOptionsProp(this.options, 'package');
    const packageNames = Array.isArray(packageOption)
      ? packageOption
      : [packageOption];

    // 3. 逐个包查找包对象并把其中的服务注册到 gRPC 服务器
    for (const packageName of packageNames) {
      const grpcPkg = this.lookupPackage(grpcContext, packageName);
      await this.createServices(grpcPkg, packageName);
    }
  }

  /**
   * Will return all of the services along with their fully namespaced
   * names as an array of objects.
   * This method initiates recursive scan of grpcPkg object
   */
  public getServiceNames(grpcPkg: any): { name: string; service: any }[] {
    // Define accumulator to collect all of the services available to load
    const services: { name: string; service: any }[] = [];
    // Initiate recursive services collector starting with empty name
    this.collectDeepServices('', grpcPkg, services);
    return services;
  }

  /**
   * 把 options.keepalive 中的驼峰命名选项转换为 gRPC 所需的
   * `grpc.*` 通道参数键值对。
   * @returns 转换后的 keepalive 通道选项；未配置时返回空对象
   */
  public getKeepaliveOptions() {
    if (!isObject(this.options.keepalive)) {
      return {};
    }
    const keepaliveKeys: Record<string, string> = {
      keepaliveTimeMs: 'grpc.keepalive_time_ms',
      keepaliveTimeoutMs: 'grpc.keepalive_timeout_ms',
      keepalivePermitWithoutCalls: 'grpc.keepalive_permit_without_calls',
      http2MaxPingsWithoutData: 'grpc.http2.max_pings_without_data',
      http2MinTimeBetweenPingsMs: 'grpc.http2.min_time_between_pings_ms',
      http2MinPingIntervalWithoutDataMs:
        'grpc.http2.min_ping_interval_without_data_ms',
      http2MaxPingStrikes: 'grpc.http2.max_ping_strikes',
    };

    const keepaliveOptions = {};
    for (const [optionKey, optionValue] of Object.entries(
      this.options.keepalive,
    )) {
      const key = keepaliveKeys[optionKey];
      if (key === undefined) {
        continue;
      }
      keepaliveOptions[key] = optionValue;
    }
    return keepaliveOptions;
  }

  /**
   * Will create service mapping from gRPC generated Object to handlers
   * defined with @GrpcMethod or @GrpcStreamMethod annotations
   *
   * @param grpcService
   * @param name
   */
  public async createService(grpcService: any, name: string) {
    const service = {};

    for (const methodName in grpcService.prototype) {
      let methodHandler: MessageHandler | null = null;
      let streamingType = GrpcMethodStreamingType.NO_STREAMING;

      const methodFunction = grpcService.prototype[methodName];
      const methodReqStreaming = methodFunction.requestStream;

      if (!isUndefined(methodReqStreaming) && methodReqStreaming) {
        // Try first pattern to be presented, RX streaming pattern would be
        // a preferable pattern to select among a few defined
        methodHandler = this.getMessageHandler(
          name,
          methodName,
          GrpcMethodStreamingType.RX_STREAMING,
          methodFunction,
        );
        streamingType = GrpcMethodStreamingType.RX_STREAMING;
        // If first pattern didn't match to any of handlers then try
        // pass-through handler to be presented
        if (!methodHandler) {
          methodHandler = this.getMessageHandler(
            name,
            methodName,
            GrpcMethodStreamingType.PT_STREAMING,
            methodFunction,
          );
          streamingType = GrpcMethodStreamingType.PT_STREAMING;
        }
      } else {
        // Select handler if any presented for No-Streaming pattern
        methodHandler = this.getMessageHandler(
          name,
          methodName,
          GrpcMethodStreamingType.NO_STREAMING,
          methodFunction,
        );
        streamingType = GrpcMethodStreamingType.NO_STREAMING;
      }
      if (!methodHandler) {
        continue;
      }

      Object.defineProperty(methodHandler, 'name', {
        value: methodName,
        writable: false,
      });
      service[methodName] = this.createServiceMethod(
        methodHandler,
        grpcService.prototype[methodName],
        streamingType,
      );
    }
    return service;
  }

  /**
   * 按/proto 方法签名查找消息处理器：pattern 形如
   * `{ service, rpc, streaming }` 的 JSON 字符串；
   * 优先用「包名.服务名」匹配，找不到时回退到 proto 方法
   * 路径中的服务名再匹配一次。
   *
   * @param serviceName 服务全名（如 "Bundle.FirstService"）
   * @param methodName rpc 方法名
   * @param streaming 流类型（NO_STREAMING / RX_STREAMING / PT_STREAMING）
   * @param grpcMethod proto 方法描述对象（含 path，用于提取服务名）
   * @returns 匹配到的处理器；未注册时返回 undefined
   */
  public getMessageHandler(
    serviceName: string,
    methodName: string,
    streaming: GrpcMethodStreamingType,
    grpcMethod: { path?: string },
  ): MessageHandler {
    // 1. 先按传入的服务名构造 pattern 查找
    let pattern = this.createPattern(serviceName, methodName, streaming);
    let methodHandler = this.messageHandlers.get(pattern)!;
    if (!methodHandler) {
      // 2. 找不到时，从 proto 方法路径（/package.Service/Method）中
      //    提取服务名重新构造 pattern 再查找
      const packageServiceName = grpcMethod.path?.split?.('/')[1];
      pattern = this.createPattern(packageServiceName!, methodName, streaming);
      methodHandler = this.messageHandlers.get(pattern)!;
    }
    return methodHandler;
  }

  /**
   * Will create a string of a JSON serialized format
   *
   * @param service name of the service which should be a match to gRPC service definition name
   * @param methodName name of the method which is coming after rpc keyword
   * @param streaming GrpcMethodStreamingType parameter which should correspond to
   * stream keyword in gRPC service request part
   */
  public createPattern(
    service: string,
    methodName: string,
    streaming: GrpcMethodStreamingType,
  ): string {
    return JSON.stringify({
      service,
      rpc: methodName,
      streaming,
    });
  }

  /**
   * Will return async function which will handle gRPC call
   * with Rx streams or as a direct call passthrough
   *
   * @param methodHandler
   * @param protoNativeHandler
   * @param streamType
   */
  public createServiceMethod(
    methodHandler: Function,
    protoNativeHandler: any,
    streamType: GrpcMethodStreamingType,
  ): Function {
    // If proto handler has request stream as "true" then we expect it to have
    // streaming from the side of requester
    if (protoNativeHandler.requestStream) {
      // If any handlers were defined with GrpcStreamMethod annotation use RX
      if (streamType === GrpcMethodStreamingType.RX_STREAMING) {
        return this.createRequestStreamMethod(
          methodHandler,
          protoNativeHandler.responseStream,
        );
      }
      // If any handlers were defined with GrpcStreamCall annotation
      else if (streamType === GrpcMethodStreamingType.PT_STREAMING) {
        return this.createStreamCallMethod(
          methodHandler,
          protoNativeHandler.responseStream,
        );
      }
    }
    return protoNativeHandler.responseStream
      ? this.createStreamServiceMethod(methodHandler)
      : this.createUnaryServiceMethod(methodHandler);
  }

  /**
   * 为一元调用（非流式）创建 gRPC 方法包装：执行处理器并把
   * 返回值通过 gRPC 回调 callback(err, data) 回传。
   * @param methodHandler 注册的 @GrpcMethod 处理器
   * @returns 可注册到 gRPC 服务的处理函数
   */
  public createUnaryServiceMethod(methodHandler: Function): Function {
    return async (call: GrpcCall, callback: Function) => {
      return this.onProcessingStartHook(
        this.transportId,
        { ...call, operationId: methodHandler.name } as any,
        async () => {
          // 1. 执行处理器（入参：请求、元数据、调用对象）
          const handler = methodHandler(call.request, call.metadata, call);
          // 2. 结果统一转为 Observable，逐值回调，出错时回调错误，完成时触发结束钩子
          this.transformToObservable(await handler).subscribe({
            next: async data => callback(null, await data),
            error: (err: any) => callback(err),
            complete: () => {
              this.onProcessingEndHook?.(this.transportId, call.request);
            },
          });
        },
      );
    };
  }

  /**
   * 为服务端流式调用（responseStream=true）创建方法包装：
   * 把处理器返回的 Observable 逐值写入 gRPC call（自动处理背压）。
   * @param methodHandler 注册的 @GrpcMethod 处理器
   * @returns 可注册到 gRPC 服务的处理函数
   */
  public createStreamServiceMethod(methodHandler: Function): Function {
    return async (call: GrpcCall, callback: Function) => {
      return this.onProcessingStartHook(
        this.transportId,
        { ...call, operationId: methodHandler.name } as any,
        async () => {
          // 1. 执行处理器并把结果统一转为 Observable
          const handler = methodHandler(call.request, call.metadata, call);
          const result$ = this.transformToObservable(await handler);
          // 2. 逐值写入 gRPC call（writeObservableToGrpc 内部处理背压与错误）
          await this.writeObservableToGrpc(result$, call);

          this.onProcessingEndHook?.(this.transportId, call.request);
        },
      );
    };
  }

  /**
   * gRPC 传输不支持暴露底层实例，调用即抛错。
   * @throws 始终抛出不支持错误
   */
  public unwrap<T>(): T {
    throw new Error('Method is not supported for gRPC transport');
  }

  /**
   * gRPC 传输不支持注册通用事件监听器，调用即抛错。
   * @throws 始终抛出不支持错误
   */
  public on<
    EventKey extends string | number | symbol = string | number | symbol,
    EventCallback = any,
  >(event: EventKey, callback: EventCallback) {
    throw new Error('Method is not supported in gRPC mode.');
  }

  /**
   * Writes an observable to a GRPC call.
   *
   * This function will ensure that backpressure is managed while writing values
   * that come from an observable to a GRPC call.
   *
   * @param source The observable we want to write out to the GRPC call.
   * @param call The GRPC call we want to write to.
   * @returns A promise that resolves when we're done writing to the call.
   */
  private writeObservableToGrpc<T>(
    source: Observable<T>,
    call: GrpcCall<T>,
  ): Promise<void> {
    // This promise should **not** reject, as we're handling errors in the observable for the Call
    // the promise is only needed to signal when writing/draining has been completed
    return new Promise((resolve, _doNotUse) => {
      const valuesWaitingToBeDrained: T[] = [];
      let shouldErrorAfterDraining = false;
      let error: any;
      let shouldResolveAfterDraining = false;
      let writing = true;

      // Used to manage finalization
      const subscription = new Subscription();

      // If the call is cancelled, unsubscribe from the source
      const cancelHandler = () => {
        subscription.unsubscribe();
        // Calls that are cancelled by the client should be successfully resolved here
        resolve();
      };
      call.on(CANCELLED_EVENT, cancelHandler);
      subscription.add(() => call.off(CANCELLED_EVENT, cancelHandler));

      // In all cases, when we finalize, end the writable stream
      // being careful that errors and writes must be emitted _before_ this call is ended
      subscription.add(() => call.end());

      const drain = () => {
        writing = true;
        while (valuesWaitingToBeDrained.length > 0) {
          const value = valuesWaitingToBeDrained.shift();
          if (writing) {
            // The first time `call.write` returns false, we need to stop.
            // It wrote the value, but it won't write anything else.
            writing = call.write(value);
            if (!writing) {
              // We can't write anymore so we need to wait for the drain event
              return;
            }
          }
        }

        if (shouldResolveAfterDraining) {
          subscription.unsubscribe();
          resolve();
        } else if (shouldErrorAfterDraining) {
          call.emit('error', error);
          subscription.unsubscribe();
          resolve();
        }
      };

      call.on('drain', drain);
      subscription.add(() => call.off('drain', drain));

      subscription.add(
        source.subscribe({
          next(value) {
            if (writing) {
              writing = call.write(value);
            } else {
              // If we can't write, that's because we need to
              // wait for the drain event before we can write again
              // buffer the value and wait for the drain event
              valuesWaitingToBeDrained.push(value);
            }
          },
          error(err) {
            if (valuesWaitingToBeDrained.length === 0) {
              // We're not waiting for a drain event, so we can just
              // reject and teardown.
              call.emit('error', err);
              subscription.unsubscribe();
              resolve();
            } else {
              // We're waiting for a drain event, record the
              // error so it can be handled after everything is drained.
              shouldErrorAfterDraining = true;
              error = err;
            }
          },
          complete() {
            if (valuesWaitingToBeDrained.length === 0) {
              // We're not waiting for a drain event, so we can just
              // resolve and teardown.
              subscription.unsubscribe();
              resolve();
            } else {
              shouldResolveAfterDraining = true;
            }
          },
        }),
      );
    });
  }

  /**
   * 为「客户端流 + @GrpcStreamMethod（RX 流式）」创建方法包装：
   * 把 gRPC call 收到的每条消息推入一个 Subject，把该 Subject 的
   * Observable 交给处理器；响应按需写回流或通过回调回传。
   *
   * @param methodHandler 注册的 @GrpcStreamMethod 处理器
   * @param isResponseStream proto 中 responseStream 是否为 true
   * @returns 可注册到 gRPC 服务的处理函数
   */
  public createRequestStreamMethod(
    methodHandler: Function,
    isResponseStream: boolean,
  ) {
    return async (
      call: GrpcCall,
      callback: (err: unknown, value: unknown) => void,
    ) => {
      return this.onProcessingStartHook(
        this.transportId,
        { ...call, operationId: methodHandler.name } as any,
        async () => {
          // Needs to be a Proxy in order to buffer messages that come before handler is executed
          // This could happen if handler has any async guards or interceptors registered that would delay
          // the execution.
          // 1. 创建带缓冲的流主体：在处理器真正执行前（存在异步守卫/拦截器时）
          //    先把到达的消息缓存起来，避免丢失
          const { subject, next, error, complete, cleanup } =
            this.bufferUntilDrained();
          // 2. 把 gRPC 流的 data/error/end 事件接入流主体
          call.on('data', (m: any) => next(m));
          call.on('error', (e: any) => {
            // Check if error means that stream ended on other end
            const isCancelledError = String(e)
              .toLowerCase()
              .indexOf('cancelled');

            if (isCancelledError !== -1) {
              // 3. 客户端取消：结束流即可，无需传播错误
              call.end();
              return;
            }
            // If another error then just pass it along
            // 4. 其他错误：透传到流主体
            error(e);
          });
          call.on('end', () => {
            // 5. 客户端发送完毕：关闭流主体并触发结束钩子
            complete();
            cleanup();

            this.onProcessingEndHook?.(this.transportId, call.request);
          });

          // 6. 把流主体的 Observable 交给处理器
          const handler = methodHandler(
            subject.asObservable(),
            call.metadata,
            call,
          );
          const res = this.transformToObservable(await handler);
          if (isResponseStream) {
            // 7. 服务端也是流式响应：逐值写回 gRPC call
            await this.writeObservableToGrpc(res, call);
          } else {
            // 8. 服务端一元响应：取响应流最后一个值（客户端取消时提前终止）
            const response = await lastValueFrom(
              res.pipe(
                takeUntil(fromEvent(call as any, CANCELLED_EVENT)),
                catchError(err => {
                  callback(err, null);
                  return EMPTY;
                }),
                defaultIfEmpty(undefined),
              ),
            );

            if (!isUndefined(response)) {
              callback(null, response);
            }
          }
        },
      );
    };
  }

  /**
   * 为「双向流 + @GrpcStreamCall（直通式）」创建方法包装：
   * 直接把原始 gRPC call 对象交给处理器，由处理器自行读写流事件。
   *
   * @param methodHandler 注册的 @GrpcStreamCall 处理器
   * @param isResponseStream proto 中 responseStream 是否为 true
   * @returns 可注册到 gRPC 服务的处理函数
   */
  public createStreamCallMethod(
    methodHandler: Function,
    isResponseStream: boolean,
  ) {
    return async (
      call: GrpcCall,
      callback: (err: unknown, value: unknown) => void,
    ) => {
      return this.onProcessingStartHook(
        this.transportId,
        { ...call, operationId: methodHandler.name } as any,
        async () => {
          // 1. responseStream 为 true 时只传 call；否则额外传 callback 供处理器回传结果
          let handlerStream: Observable<any>;
          if (isResponseStream) {
            handlerStream = this.transformToObservable(
              await methodHandler(call),
            );
          } else {
            handlerStream = this.transformToObservable(
              await methodHandler(call, callback),
            );
          }
          // 2. 等待处理器流完成后再触发结束钩子
          await lastValueFrom(handlerStream).finally(() => {
            this.onProcessingEndHook?.(this.transportId, call.request);
          });
        },
      );
    };
  }

  /**
   * 关闭 gRPC 服务器：配置 gracefulShutdown 时优雅等待在途请求
   * （tryShutdown），否则强制关闭（forceShutdown）。
   */
  public async close(): Promise<void> {
    if (this.grpcClient) {
      const graceful = this.getOptionsProp(this.options, 'gracefulShutdown');
      if (graceful) {
        // 1. 优雅关闭：等待所有在途请求完成后关闭
        await new Promise<void>((resolve, reject) => {
          this.grpcClient.tryShutdown((error: Error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      } else {
        // 2. 立即强制关闭
        this.grpcClient.forceShutdown();
      }
    }
    this.grpcClient = null;
  }

  /**
   * 反序列化工具：尝试把字符串解析为 JSON，失败时原样返回。
   * @param obj 待解析的值
   * @returns 解析后的 JSON 对象或原值
   */
  public deserialize(obj: any): any {
    try {
      return JSON.parse(obj);
    } catch (e) {
      return obj;
    }
  }

  /**
   * gRPC 覆盖版本的处理器注册：pattern 直接按字符串（或 JSON 序列化）
   * 存入注册表（不走基类的 normalizePattern 逻辑）。
   * @param pattern 消息模式（{ service, rpc, streaming } 对象或字符串）
   * @param callback 消息处理器
   * @param isEventHandler 是否为事件处理器
   */
  public addHandler(
    pattern: unknown,
    callback: MessageHandler,
    isEventHandler = false,
  ) {
    const route = isString(pattern) ? pattern : JSON.stringify(pattern);
    callback.isEventHandler = isEventHandler;
    this.messageHandlers.set(route, callback);
  }

  /**
   * 创建底层 gRPC 服务器实例并绑定端口：合并 channelOptions、
   * 消息长度限制、keepalive 等选项，然后绑定监听地址与凭据。
   * @returns 已完成端口绑定的 gRPC 服务器实例
   */
  public async createClient() {
    // 1. 汇集通道选项：用户配置 + 最大发送/接收消息长度 + 元数据大小限制
    const channelOptions: ChannelOptions =
      this.options && this.options.channelOptions
        ? this.options.channelOptions
        : {};
    if (this.options && this.options.maxSendMessageLength) {
      channelOptions['grpc.max_send_message_length'] =
        this.options.maxSendMessageLength;
    }
    if (this.options && this.options.maxReceiveMessageLength) {
      channelOptions['grpc.max_receive_message_length'] =
        this.options.maxReceiveMessageLength;
    }
    if (this.options && this.options.maxMetadataSize) {
      channelOptions['grpc.max_metadata_size'] = this.options.maxMetadataSize;
    }

    // 2. 转换并合并 keepalive 选项
    const keepaliveOptions = this.getKeepaliveOptions();
    const options: Record<string, string | number> = {
      ...channelOptions,
      ...keepaliveOptions,
    };

    // Use merged options instead of just channelOptions
    // 3. 创建服务器实例（使用合并后的完整选项）
    const server = new grpcPackage.Server(options);
    const credentials = this.getOptionsProp(this.options, 'credentials');

    // 4. 绑定监听地址：未配置凭据时使用不安全（无 TLS）凭据
    await new Promise((resolve, reject) => {
      server.bindAsync(
        this.url,
        credentials || grpcPackage.ServerCredentials.createInsecure(),
        (error: Error | null, port: number) =>
          error ? reject(error) : resolve(port),
      );
    });

    return server;
  }

  /**
   * 按点分路径从 proto 包定义根对象中查找指定包（命名空间）对象。
   * @param root 包定义根对象
   * @param packageName 点分命名空间（如 "Bundle.FirstService"）
   * @returns 对应的包对象；任一层不存在时返回 undefined
   */
  public lookupPackage(root: any, packageName: string) {
    /** Reference: https://github.com/kondi/rxjs-grpc */
    let pkg = root;
    for (const name of packageName.split(/\./)) {
      pkg = pkg[name];
    }
    return pkg;
  }

  /**
   * 加载 .proto 文件并生成 gRPC 包定义：
   * 借助 proto-loader 生成 packageDefinition，回调
   * onLoadPackageDefinition 钩子后转换为运行时包对象。
   * @returns 加载后的 gRPC 包对象
   * @throws proto 定义无效时抛出 InvalidProtoDefinitionException
   */
  public loadProto(): any {
    try {
      // 1. 根据 protoPath/loaderOptions/package 生成包定义
      const packageDefinition = getGrpcPackageDefinition(
        this.options,
        grpcProtoLoaderPackage,
      );

      // 2. 用户自定义钩子：允许在加载后对包定义做额外处理
      if (this.options.onLoadPackageDefinition) {
        this.options.onLoadPackageDefinition(
          packageDefinition,
          this.grpcClient,
        );
      }

      // 3. 转换为 gRPC 运行时包对象
      return grpcPackage.loadPackageDefinition(packageDefinition);
    } catch (err) {
      // 4. proto 定义错误：包装为 InvalidProtoDefinitionException 并抛出
      const invalidProtoError = new InvalidProtoDefinitionException(err.path);
      const message =
        err && err.message ? err.message : invalidProtoError.message;

      this.logger.error(message, invalidProtoError.stack);
      throw invalidProtoError;
    }
  }

  /**
   * Recursively fetch all of the service methods available on loaded
   * protobuf descriptor object, and collect those as an objects with
   * dot-syntax full-path names.
   *
   * Example:
   *  for proto package Bundle.FirstService with service Events { rpc...
   *  will be resolved to object of (while loaded for Bundle package):
   *    {
   *      name: "FirstService.Events",
   *      service: {Object}
   *    }
   */
  private collectDeepServices(
    name: string,
    grpcDefinition: any,
    accumulator: { name: string; service: any }[],
  ) {
    if (!isObject(grpcDefinition)) {
      return;
    }
    const keysToTraverse = Object.keys(grpcDefinition);
    // Traverse definitions or namespace extensions
    for (const key of keysToTraverse) {
      const nameExtended = this.parseDeepServiceName(name, key);
      const deepDefinition = grpcDefinition[key];

      const isServiceDefined =
        deepDefinition && !isUndefined(deepDefinition.service);
      const isServiceBoolean = isServiceDefined
        ? deepDefinition.service !== false
        : false;

      // grpc namespace object does not have 'format' or 'service' properties defined
      const isFormatDefined =
        deepDefinition && !isUndefined(deepDefinition.format);

      if (isServiceDefined && isServiceBoolean) {
        accumulator.push({
          name: nameExtended,
          service: deepDefinition,
        });
      } else if (isFormatDefined) {
        // Do nothing
      } else {
        // Continue recursion for namespace object until objects end or service definition found
        this.collectDeepServices(nameExtended, deepDefinition, accumulator);
      }
    }
  }

  private parseDeepServiceName(name: string, key: string): string {
    // If depth is zero then just return key
    if (name.length === 0) {
      return key;
    }
    // Otherwise add next through dot syntax
    return name + '.' + key;
  }

  /**
   * 把 proto 包中定义的所有 service 注册到底层 gRPC 服务器：
   * 递归收集服务定义，然后为每个服务绑定控制器中声明的处理器。
   * @param grpcPkg proto 包对象
   * @param packageName 包名（用于错误提示）
   * @throws 包不存在时抛出 InvalidGrpcPackageException
   */
  private async createServices(grpcPkg: any, packageName: string) {
    if (!grpcPkg) {
      // 1. 配置的 package 在 proto 中不存在：抛出错误
      const invalidPackageError = new InvalidGrpcPackageException(packageName);
      this.logger.error(invalidPackageError);
      throw invalidPackageError;
    }

    // Take all of the services defined in grpcPkg and assign them to
    // method handlers defined in Controllers
    // 2. 遍历包内所有服务定义，逐个注册：第一个参数为 proto 服务定义，
    //    第二个参数为由处理器包装而成的方法实现集合
    for (const definition of this.getServiceNames(grpcPkg)) {
      this.grpcClient.addService(
        // First parameter requires exact service definition from proto
        definition.service.service,
        // Here full proto definition required along with namespaced pattern name
        await this.createService(definition.service, definition.name),
      );
    }
  }

  /**
   * 创建「可延迟排空」的流主体：底层是 Subject + ReplaySubject 缓冲区。
   * 在处理器尚未开始消费（drainBuffer 未被调用）前，所有 next/error/complete
   * 都会先记录到 ReplaySubject；调用 drainBuffer 后缓冲内容回放给真实 Subject，
   * 保证异步守卫/拦截器执行期间到达的消息不丢失。
   *
   * @typeParam T - 流元素类型
   * @returns 包含 Proxy 包装的 subject 与 next/error/complete/cleanup 控制函数的对象
   */
  private bufferUntilDrained<T>() {
    type DrainableSubject<T> = Subject<T> & { drainBuffer: () => void };

    const subject = new Subject<T>();
    let replayBuffer: ReplaySubject<T> | null = new ReplaySubject<T>();
    let hasDrained = false;

    function drainBuffer(this: DrainableSubject<T>) {
      if (hasDrained || !replayBuffer) {
        return;
      }
      hasDrained = true;

      // Replay buffered values to the new subscriber
      setImmediate(() => {
        const subcription = replayBuffer!.subscribe(subject);
        subcription.unsubscribe();
        replayBuffer = null;
      });
    }

    return {
      subject: new Proxy<DrainableSubject<T>>(subject as DrainableSubject<T>, {
        get(target, prop, receiver) {
          if (prop === 'asObservable') {
            return () => {
              const stream = subject.asObservable();

              // "drainBuffer" will be called before the evaluation of the handler
              // but after any enhancers have been applied (e.g., `interceptors`)
              Object.defineProperty(stream, drainBuffer.name, {
                value: drainBuffer,
              });
              return stream;
            };
          }
          if (hasDrained) {
            return Reflect.get(target, prop, receiver);
          }
          return Reflect.get(replayBuffer!, prop, receiver);
        },
      }),
      next: (value: T) => {
        if (!hasDrained) {
          replayBuffer!.next(value);
        }
        subject.next(value);
      },
      error: (err: any) => {
        if (!hasDrained) {
          replayBuffer!.error(err);
        }
        subject.error(err);
      },
      complete: () => {
        if (!hasDrained) {
          replayBuffer!.complete();
          // Replay buffer is no longer needed
          // Return early to allow subject to complete later, after the replay buffer
          // has been drained
          return;
        }
        subject.complete();
      },
      cleanup: () => {
        if (hasDrained) {
          return;
        }
        replayBuffer = null;
      },
    };
  }
}
