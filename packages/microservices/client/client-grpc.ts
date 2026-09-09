import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isFunction, isObject } from '@nestjs/common/utils/shared.utils';
import { Observable, Subscription } from 'rxjs';
import { GRPC_DEFAULT_PROTO_LOADER, GRPC_DEFAULT_URL } from '../constants';
import { InvalidGrpcPackageException } from '../errors/invalid-grpc-package.exception';
import { InvalidGrpcServiceException } from '../errors/invalid-grpc-service.exception';
import { InvalidProtoDefinitionException } from '../errors/invalid-proto-definition.exception';
import { ChannelOptions } from '../external/grpc-options.interface';
import { getGrpcPackageDefinition } from '../helpers';
import { ClientGrpc, GrpcOptions } from '../interfaces';
import { ClientProxy } from './client-proxy';

const GRPC_CANCELLED = 'Cancelled';

// To enable type safety for gRPC. This cant be uncommented by default
// because it would require the user to install the @grpc/grpc-js package even if they dont use gRPC
// Otherwise, TypeScript would fail to compile the code.
//
// type GrpcClient = import('@grpc/grpc-js').Client;
// let grpcPackage = {} as typeof import('@grpc/grpc-js');
// let grpcProtoLoaderPackage = {} as typeof import('@grpc/proto-loader');

type GrpcClient = any;
let grpcPackage = {} as any;
let grpcProtoLoaderPackage = {} as any;

/**
 * 基于 gRPC（@grpc/grpc-js）的客户端代理实现（ClientProxy 的子类）。
 * 与其他客户端不同，gRPC 模式下不使用 send()/emit()，
 * 而是通过 getService() 按 proto 定义生成强类型服务客户端，
 * 方法调用直接映射为 gRPC 的 unary/stream 调用（返回 Observable）。
 * 依赖 @grpc/grpc-js 与 proto 加载器（默认 @grpc/proto-loader），首次使用时动态加载。
 *
 * @publicApi
 */
export class ClientGrpcProxy
  extends ClientProxy<never, never>
  implements ClientGrpc
{
  protected readonly logger = new Logger(ClientProxy.name);
  /** 已创建的 gRPC 客户端缓存（service name -> grpc client） */
  protected readonly clients = new Map<string, any>();
  /** gRPC 服务端地址 */
  protected readonly url: string;
  /** 从 proto 文件加载出的包定义（按 package 声明加载） */
  protected grpcClients: GrpcClient[] = [];

  /**
   * gRPC 传输不支持 status 状态流，访问即抛错。
   */
  get status(): never {
    throw new Error(
      'The "status" attribute is not supported by the gRPC transport',
    );
  }

  /**
   * @param options - gRPC 客户端选项（protoPath、package、url、credentials、channelOptions、keepalive 等）
   */
  constructor(protected readonly options: Required<GrpcOptions>['options']) {
    super();
    this.url = this.getOptionsProp(options, 'url') || GRPC_DEFAULT_URL;

    const protoLoader =
      this.getOptionsProp(options, 'protoLoader') || GRPC_DEFAULT_PROTO_LOADER;

    grpcPackage = loadPackage('@grpc/grpc-js', ClientGrpcProxy.name, () =>
      require('@grpc/grpc-js'),
    );

    grpcProtoLoaderPackage = loadPackage(
      protoLoader,
      ClientGrpcProxy.name,
      () =>
        protoLoader === GRPC_DEFAULT_PROTO_LOADER
          ? require('@grpc/proto-loader')
          : require(protoLoader),
    );
    this.grpcClients = this.createClients();
  }

  /**
   * 获取指定名称的 gRPC 服务客户端：
   * 1. 找到 proto 中对应 service 的客户端构造器；
   * 2. 遍历其原型上的所有方法；
   * 3. 为每个方法创建响应式包装（unary 或 stream），组装成可注入使用的服务对象。
   * @param name - proto 中定义的服务名
   * @returns 方法返回 Observable 的服务客户端对象
   */
  public getService<T extends object>(name: string): T {
    const grpcClient = this.getClientByServiceName(name);
    const clientRef = this.getClient(name);
    if (!clientRef) {
      throw new InvalidGrpcServiceException(name);
    }

    const protoMethods = Object.keys(clientRef[name].prototype);
    const grpcService = {} as T;

    protoMethods.forEach(m => {
      grpcService[m] = this.createServiceMethod(grpcClient, m);
    });
    return grpcService;
  }

  /**
   * 按服务名获取（或首次创建并缓存）底层 gRPC 客户端实例。
   * @param name - 服务名
   * @returns gRPC 客户端实例
   */
  public getClientByServiceName<T = unknown>(name: string): T {
    return this.clients.get(name) || this.createClientByServiceName(name);
  }

  /**
   * 为指定服务创建底层 gRPC 客户端：
   * 1. 组装 channel 选项（最大消息长度、元数据大小等）与 keepalive 选项；
   * 2. 使用用户提供的 credentials，否则创建不安全的（insecure）凭据；
   * 3. 实例化 gRPC 客户端（url + credentials + options）并缓存。
   * @param name - 服务名
   * @returns gRPC 客户端实例
   */
  public createClientByServiceName(name: string) {
    const clientRef = this.getClient(name);
    if (!clientRef) {
      throw new InvalidGrpcServiceException(name);
    }

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

    const keepaliveOptions = this.getKeepaliveOptions();
    const options: Record<string, string | number> = {
      ...channelOptions,
      ...keepaliveOptions,
    };

    const credentials =
      this.options.credentials || grpcPackage.credentials.createInsecure();

    const grpcClient = new clientRef[name](this.url, credentials, options);
    this.clients.set(name, grpcClient);
    return grpcClient;
  }

  /**
   * 把 keepalive 配置对象映射为 gRPC 的 channel 参数键名
   * （如 keepaliveTimeMs -> grpc.keepalive_time_ms），未识别的键会被跳过。
   * @returns gRPC keepalive channel 选项
   */
  public getKeepaliveOptions() {
    if (!isObject(this.options.keepalive)) {
      return {};
    }
    const keepaliveKeys: Record<
      keyof NonNullable<GrpcOptions['options']['keepalive']>,
      string
    > = {
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
   * 为单个 proto 方法创建响应式调用包装：
   * 响应为流（responseStream）的方法走 createStreamServiceMethod，
   * 否则走 createUnaryServiceMethod。
   * @param client - 底层 gRPC 客户端
   * @param methodName - 方法名
   * @returns 返回 Observable 的方法包装
   */
  public createServiceMethod(
    client: any,
    methodName: string,
  ): (...args: unknown[]) => Observable<unknown> {
    return client[methodName].responseStream
      ? this.createStreamServiceMethod(client, methodName)
      : this.createUnaryServiceMethod(client, methodName);
  }

  /**
   * 创建“服务端流式”方法的 Observable 包装：
   * 1. 请求为流且第一个参数是 Observable 时，先建立 call，再订阅上游 Observable 逐条写入；
   * 2. 监听 call 的 data/error/end 事件分别对应 observer.next/error/complete；
   * 3. "Cancelled" 错误且为客户端主动取消时不重复抛错；
   * 4. 取消订阅（teardown）时退订上游并取消未完成的 call。
   * @param client - 底层 gRPC 客户端
   * @param methodName - 方法名
   * @returns 返回 Observable 的流式方法
   */
  public createStreamServiceMethod(
    client: unknown,
    methodName: string,
  ): (...args: any[]) => Observable<any> {
    return (...args: any[]) => {
      const isRequestStream = client![methodName].requestStream;
      const stream = new Observable(observer => {
        let isClientCanceled = false;
        let upstreamSubscription: Subscription | null = null;

        const upstreamSubjectOrData = args[0];
        const maybeMetadata = args[1];

        const isUpstreamSubject =
          upstreamSubjectOrData && isFunction(upstreamSubjectOrData.subscribe);

        const call =
          isRequestStream && isUpstreamSubject
            ? client![methodName](maybeMetadata)
            : client![methodName](...args);

        if (isRequestStream && isUpstreamSubject) {
          upstreamSubscription = upstreamSubjectOrData.subscribe(
            (val: unknown) => call.write(val),
            (err: unknown) => call.emit('error', err),
            () => call.end(),
          );
        }
        call.on('data', (data: any) => observer.next(data));
        call.on('error', (error: any) => {
          if (error.details === GRPC_CANCELLED) {
            call.destroy();
            if (isClientCanceled) {
              return;
            }
          }
          observer.error(this.serializeError(error));
        });
        call.on('end', () => {
          if (upstreamSubscription) {
            upstreamSubscription.unsubscribe();
            upstreamSubscription = null;
          }
          call.removeAllListeners();
          observer.complete();
        });
        return () => {
          if (upstreamSubscription) {
            upstreamSubscription.unsubscribe();
            upstreamSubscription = null;
          }

          if (call.finished) {
            return undefined;
          }
          isClientCanceled = true;
          call.cancel();
        };
      });
      return stream;
    };
  }

  /**
   * 创建“一元（unary）”方法的 Observable 包装：
   * 1. 请求为流且第一个参数是 Observable 时，建立 call 并订阅上游逐条写入，
   *    通过回调把单次响应转为 observer.next + complete；
   * 2. 普通一元调用：直接调用 gRPC 方法并把回调结果转为 Observable；
   * 3. teardown 时取消未完成的 call。
   * @param client - 底层 gRPC 客户端
   * @param methodName - 方法名
   * @returns 返回 Observable 的一元方法
   */
  public createUnaryServiceMethod(
    client: any,
    methodName: string,
  ): (...args: any[]) => Observable<any> {
    return (...args: any[]) => {
      const isRequestStream = client[methodName].requestStream;
      const upstreamSubjectOrData = args[0];
      const isUpstreamSubject =
        upstreamSubjectOrData && isFunction(upstreamSubjectOrData.subscribe);

      if (isRequestStream && isUpstreamSubject) {
        return new Observable(observer => {
          let isClientCanceled = false;
          const callArgs = [
            (error: any, data: unknown) => {
              if (error) {
                if (error.details === GRPC_CANCELLED || error.code === 1) {
                  call.destroy();
                  if (isClientCanceled) {
                    return;
                  }
                }
                return observer.error(this.serializeError(error));
              }
              observer.next(data);
              observer.complete();
            },
          ];
          const maybeMetadata = args[1];
          if (maybeMetadata) {
            callArgs.unshift(maybeMetadata);
          }
          const call = client[methodName](...callArgs);

          const upstreamSubscription: Subscription =
            upstreamSubjectOrData.subscribe(
              (val: unknown) => call.write(val),
              (err: unknown) => call.emit('error', err),
              () => call.end(),
            );

          return () => {
            upstreamSubscription.unsubscribe();
            if (!call.finished) {
              isClientCanceled = true;
              call.cancel();
            }
          };
        });
      }
      return new Observable(observer => {
        const call = client[methodName](...args, (error: any, data: any) => {
          if (error) {
            return observer.error(this.serializeError(error));
          }
          observer.next(data);
          observer.complete();
        });

        return () => {
          if (!call.finished) {
            call.cancel();
          }
        };
      });
    };
  }

  /**
   * 加载 proto 定义并取出各 package 的服务客户端构造器：
   * 1. 加载 proto 得到 grpc 上下文；
   * 2. 按 options.package（字符串或数组）逐个查找包；
   * 3. 查找失败时抛出 InvalidGrpcPackageException。
   * @returns 各 package 的 gRPC 客户端构造器数组
   */
  public createClients(): any[] {
    const grpcContext = this.loadProto();
    const packageOption = this.getOptionsProp(this.options, 'package');
    const grpcPackages: any[] = [];
    const packageNames = Array.isArray(packageOption)
      ? packageOption
      : [packageOption];

    for (const packageName of packageNames) {
      const grpcPkg = this.lookupPackage(grpcContext, packageName);

      if (!grpcPkg) {
        const invalidPackageError = new InvalidGrpcPackageException(
          packageName,
        );
        this.logger.error(
          invalidPackageError.message,
          invalidPackageError.stack,
        );
        throw invalidPackageError;
      }
      grpcPackages.push(grpcPkg);
    }
    return grpcPackages;
  }

  /**
   * 加载 proto 文件：
   * 1. 通过 getGrpcPackageDefinition 由 protoPath/loader 生成包定义；
   * 2. 用 grpc.loadPackageDefinition 加载；出错时包装为 InvalidProtoDefinitionException 抛出。
   * @returns 加载后的 grpc 包上下文
   */
  public loadProto(): any {
    try {
      const packageDefinition = getGrpcPackageDefinition(
        this.options,
        grpcProtoLoaderPackage,
      );
      return grpcPackage.loadPackageDefinition(packageDefinition);
    } catch (err) {
      const invalidProtoError = new InvalidProtoDefinitionException(err.path);
      const message =
        err && err.message ? err.message : invalidProtoError.message;

      this.logger.error(message, invalidProtoError.stack);
      throw invalidProtoError;
    }
  }

  /**
   * 按“.”逐级在 proto 上下文中查找指定包（如 'a.b.Service' -> root['a']['b']['Service']）。
   * @param root - proto 加载结果根对象
   * @param packageName - 包名（点分隔路径）
   * @returns 找到的包对象，找不到为 undefined
   */
  public lookupPackage(root: any, packageName: string) {
    /** Reference: https://github.com/kondi/rxjs-grpc */
    let pkg = root;

    if (packageName) {
      for (const name of packageName.split('.')) {
        pkg = pkg[name];
      }
    }

    return pkg;
  }

  /**
   * 关闭所有已创建的 gRPC 客户端并清空缓存。
   */
  public close() {
    this.clients.forEach(client => {
      if (client && isFunction(client.close)) {
        client.close();
      }
    });
    this.clients.clear();
    this.grpcClients = [];
  }

  /**
   * gRPC 模式不支持显式 connect（gRPC 客户端自带懒连接），调用即抛错。
   */
  public async connect(): Promise<any> {
    throw new Error('The "connect()" method is not supported in gRPC mode.');
  }

  /**
   * gRPC 模式不支持 send()，应使用 getService()，调用即抛错。
   */
  public send<TResult = any, TInput = any>(
    pattern: any,
    data: TInput,
  ): Observable<TResult> {
    throw new Error(
      'Method is not supported in gRPC mode. Use ClientGrpc instead (learn more in the documentation).',
    );
  }

  /**
   * 在已加载的包定义中查找包含指定服务名的包。
   * @param name - 服务名
   * @returns 包含该服务的包对象
   */
  protected getClient(name: string): any {
    return this.grpcClients.find(client =>
      Object.hasOwnProperty.call(client, name),
    );
  }

  /**
   * gRPC 模式不支持 publish()，调用即抛错。
   */
  protected publish(packet: any, callback: (packet: any) => any): any {
    throw new Error(
      'Method is not supported in gRPC mode. Use ClientGrpc instead (learn more in the documentation).',
    );
  }

  /**
   * gRPC 模式不支持 dispatchEvent()，调用即抛错。
   */
  protected async dispatchEvent(packet: any): Promise<any> {
    throw new Error(
      'Method is not supported in gRPC mode. Use ClientGrpc instead (learn more in the documentation).',
    );
  }

  /**
   * gRPC 模式不支持 on() 事件监听，调用即抛错。
   */
  public on<EventKey extends never = never, EventCallback = any>(
    event: EventKey,
    callback: EventCallback,
  ) {
    throw new Error('Method is not supported in gRPC mode.');
  }

  /**
   * gRPC 模式不支持 unwrap()，调用即抛错。
   */
  public unwrap<T>(): T {
    throw new Error('Method is not supported in gRPC mode.');
  }
}
