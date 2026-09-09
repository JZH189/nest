import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { isUndefined } from '@nestjs/common/utils/shared.utils';
import { ContextIdFactory } from '@nestjs/core/helpers/context-id-factory';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { STATIC_CONTEXT } from '@nestjs/core/injector/constants';
import { NestContainer } from '@nestjs/core/injector/container';
import { Injector } from '@nestjs/core/injector/injector';
import {
  ContextId,
  InstanceWrapper,
} from '@nestjs/core/injector/instance-wrapper';
import { Module } from '@nestjs/core/injector/module';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { REQUEST_CONTEXT_ID } from '@nestjs/core/router/request/request-constants';
import {
  forkJoin,
  from as fromPromise,
  isObservable,
  mergeMap,
  Observable,
  ObservedValueOf,
  of,
} from 'rxjs';
import { IClientProxyFactory } from './client/client-proxy-factory';
import { ClientsContainer } from './container';
import { ExceptionFiltersContext } from './context/exception-filters-context';
import { RequestContextHost } from './context/request-context-host';
import { RpcContextCreator } from './context/rpc-context-creator';
import {
  DEFAULT_CALLBACK_METADATA,
  DEFAULT_GRPC_CALLBACK_METADATA,
} from './context/rpc-metadata-constants';
import { BaseRpcContext } from './ctx-host/base-rpc.context';
import { Transport } from './enums';
import { MessageHandler, PatternMetadata, RequestContext } from './interfaces';
import { MicroserviceEntrypointMetadata } from './interfaces/microservice-entrypoint-metadata.interface';
import {
  EventOrMessageListenerDefinition,
  ListenerMetadataExplorer,
} from './listener-metadata-explorer';
import { ServerGrpc } from './server';
import { Server } from './server/server';

/**
 * 监听器控制器：微服务消息处理器注册的核心协调者。
 *
 * 职责：
 * 1. registerPatternHandlers()：借助 ListenerMetadataExplorer 扫描控制器中的
 *    @EventPattern / @MessagePattern 方法，包装后注册到服务端（Server.addHandler）；
 * 2. assignClientsToProperties()：为 @Client 属性创建 ClientProxy 并注入；
 * 3. 处理请求作用域（request-scoped）控制器：每次消息到达时按需创建实例并解析其依赖；
 * 4. 在处理器抛出异常时调用 RPC 异常过滤器兜底处理。
 */
export class ListenersController {
  private readonly metadataExplorer = new ListenerMetadataExplorer(
    new MetadataScanner(),
  );
  private readonly exceptionFiltersCache = new WeakMap();

  constructor(
    private readonly clientsContainer: ClientsContainer,
    private readonly contextCreator: RpcContextCreator,
    private readonly container: NestContainer,
    private readonly injector: Injector,
    private readonly clientFactory: IClientProxyFactory,
    private readonly exceptionFiltersContext: ExceptionFiltersContext,
    private readonly graphInspector: GraphInspector,
  ) {}

  /**
   * 将一个控制器的所有模式处理器注册到服务端，核心注册流程：
   * 1. 通过元数据探索器扫描实例上所有 @EventPattern / @MessagePattern 方法；
   * 2. 过滤出与当前服务端传输层匹配的处理器（未指定 transport 或 transportId 一致）；
   * 3. 将多个 pattern 的定义拆成单 pattern 定义，逐个注册；
   * 4. 静态（非请求作用域）控制器：通过 RpcContextCreator 创建带管道/Guard/拦截器的代理，
   *    事件处理器再包一层以支持“同一 pattern 多处理器串联（forkJoin）”；
   * 5. 请求作用域控制器：创建按请求实例化的 asyncHandler；
   * 6. 最终调用 serverInstance.addHandler(pattern, handler, isEventHandler, extras) 完成注册。
   * @param instanceWrapper - 控制器的实例包装
   * @param serverInstance - 底层服务端实例
   * @param moduleKey - 控制器所属模块的 key
   */
  public registerPatternHandlers(
    instanceWrapper: InstanceWrapper<Controller>,
    serverInstance: Server,
    moduleKey: string,
  ) {
    const { instance } = instanceWrapper;

    const isStatic = instanceWrapper.isDependencyTreeStatic();
    const patternHandlers = this.metadataExplorer.explore(instance);
    const moduleRef = this.container.getModuleByKey(moduleKey);
    const defaultCallMetadata =
      serverInstance instanceof ServerGrpc
        ? DEFAULT_GRPC_CALLBACK_METADATA
        : DEFAULT_CALLBACK_METADATA;

    patternHandlers
      .filter(
        ({ transport }) =>
          isUndefined(transport) ||
          isUndefined(serverInstance.transportId) ||
          transport === serverInstance.transportId,
      )
      .reduce((acc, handler) => {
        handler.patterns.forEach(pattern =>
          acc.push({ ...handler, patterns: [pattern] }),
        );
        return acc;
      }, [] as EventOrMessageListenerDefinition[])
      .forEach((definition: EventOrMessageListenerDefinition) => {
        const {
          patterns: [pattern],
          targetCallback,
          methodKey,
          extras,
          isEventHandler,
        } = definition;

        this.insertEntrypointDefinition(
          instanceWrapper,
          definition,
          serverInstance.transportId!,
        );

        if (isStatic) {
          const proxy = this.contextCreator.create(
            instance,
            targetCallback,
            moduleKey,
            methodKey,
            STATIC_CONTEXT,
            undefined,
            defaultCallMetadata,
          );
          if (isEventHandler) {
            const eventHandler: MessageHandler = async (...args: unknown[]) => {
              const originalArgs = args;
              const [dataOrContextHost] = originalArgs;
              if (dataOrContextHost instanceof RequestContextHost) {
                args = args.slice(1, args.length);
              }
              const returnValue = proxy(...args);
              return this.forkJoinHandlersIfAttached(
                returnValue,
                originalArgs,
                eventHandler,
              );
            };
            return serverInstance.addHandler(
              pattern,
              eventHandler,
              isEventHandler,
              extras,
            );
          } else {
            return serverInstance.addHandler(
              pattern,
              proxy,
              isEventHandler,
              extras,
            );
          }
        }
        const asyncHandler = this.createRequestScopedHandler(
          instanceWrapper,
          pattern,
          moduleRef!,
          moduleKey,
          methodKey,
          defaultCallMetadata,
          isEventHandler,
        );
        serverInstance.addHandler(
          pattern,
          asyncHandler,
          isEventHandler,
          extras,
        );
      });
  }

  /**
   * 向依赖图检查器（GraphInspector）登记入口点元数据，用于可视化/审计。
   * @param instanceWrapper - 控制器实例包装
   * @param definition - 监听器定义
   * @param transportId - 传输层标识
   */
  public insertEntrypointDefinition(
    instanceWrapper: InstanceWrapper,
    definition: EventOrMessageListenerDefinition,
    transportId: Transport | symbol,
  ) {
    this.graphInspector.insertEntrypointDefinition<MicroserviceEntrypointMetadata>(
      {
        type: 'microservice',
        methodName: definition.methodKey,
        className: instanceWrapper.metatype?.name as string,
        classNodeId: instanceWrapper.id,
        metadata: {
          key: definition.patterns.toString(),
          transportId:
            typeof transportId === 'number'
              ? (Transport[transportId] as keyof typeof Transport)
              : transportId,
          patterns: definition.patterns,
          isEventHandler: definition.isEventHandler,
          extras: definition.extras,
        },
      },
      instanceWrapper.id,
    );
  }

  /**
   * 若该 pattern 上还“链式”挂接了其他处理器（handlerRef.next 存在），
   * 则用 forkJoin 并行执行当前处理器与后续处理器，合并两者的返回值。
   * @param currentReturnValue - 当前处理器的返回值
   * @param originalArgs - 原始消息参数
   * @param handlerRef - 当前已注册的处理器引用（通过 next 链接到后续处理器）
   * @returns 合并后的结果（Promise 或 Observable）
   */
  public forkJoinHandlersIfAttached(
    currentReturnValue: Promise<unknown> | Observable<unknown>,
    originalArgs: unknown[],
    handlerRef: MessageHandler,
  ) {
    if (handlerRef.next) {
      const returnedValueWrapper = handlerRef.next(
        ...(originalArgs as Parameters<MessageHandler>),
      );
      return forkJoin({
        current: this.transformToObservable(currentReturnValue),
        next: this.transformToObservable(returnedValueWrapper),
      });
    }
    return currentReturnValue;
  }

  /**
   * 为实例上所有 @Client 属性创建客户端并完成注入：
   * 1. 扫描出被 @Client 标记的属性；
   * 2. 通过 ClientProxyFactory.create 按配置创建客户端；
   * 3. 登记到 ClientsContainer（应用关闭时统一 close）；
   * 4. 将客户端实例赋值到实例属性上。
   * @param instance - 控制器或 provider 实例
   */
  public assignClientsToProperties(instance: Controller) {
    for (const {
      property,
      metadata,
    } of this.metadataExplorer.scanForClientHooks(instance)) {
      const client = this.clientFactory.create(metadata);
      this.clientsContainer.addClient(client);

      this.assignClientToInstance(instance, property, client);
    }
  }

  /**
   * 将客户端实例赋值到实例的指定属性上（相当于 `instance[property] = client`）。
   * @param instance - 目标实例
   * @param property - 属性名
   * @param client - 要注入的客户端实例
   */
  public assignClientToInstance<T = any>(
    instance: Controller,
    property: string,
    client: T,
  ) {
    Reflect.set(instance, property, client);
  }

  /**
   * 创建“请求作用域”处理器：控制器（或其依赖树）为请求作用域时，
   * 每条消息到达都要创建新的控制器实例，注册流程如下：
   * 1. 收到消息后，将参数包装为 RequestContextHost（携带 pattern、数据与 RPC 上下文）；
   * 2. 根据请求生成 contextId，并注册请求级 provider（REQUEST 对象）；
   * 3. 通过 injector.loadPerContext 在该上下文中实例化控制器及其依赖；
   * 4. 创建代理（含管道/Guard/拦截器）并调用目标方法；
   * 5. 任一步骤抛错时，用缓存的 RPC 异常过滤器统一处理异常。
   * @param wrapper - 控制器实例包装
   * @param pattern - 消息模式
   * @param moduleRef - 控制器所属模块
   * @param moduleKey - 模块 key
   * @param methodKey - 处理器方法名
   * @param defaultCallMetadata - 默认的增强器（enhancer）元数据
   * @param isEventHandler - 是否为事件处理器
   * @returns 每次调用都创建新实例作用域的异步消息处理器
   */
  public createRequestScopedHandler(
    wrapper: InstanceWrapper,
    pattern: PatternMetadata,
    moduleRef: Module,
    moduleKey: string,
    methodKey: string,
    defaultCallMetadata: Record<string, any> = DEFAULT_CALLBACK_METADATA,
    isEventHandler = false,
  ) {
    const collection = moduleRef.controllers;
    const { instance } = wrapper;

    const isTreeDurable = wrapper.isDependencyTreeDurable();

    const requestScopedHandler: MessageHandler = async (...args: unknown[]) => {
      try {
        let contextId: ContextId;

        let [dataOrContextHost] = args;
        if (dataOrContextHost instanceof RequestContextHost) {
          contextId = this.getContextId(dataOrContextHost, isTreeDurable);
          args.shift();
        } else {
          const [data, reqCtx] = args;
          const request = RequestContextHost.create(
            pattern,
            data,
            reqCtx as BaseRpcContext,
          );
          contextId = this.getContextId(request, isTreeDurable);
          dataOrContextHost = request;
        }

        const contextInstance = await this.injector.loadPerContext(
          instance,
          moduleRef,
          collection,
          contextId,
        );
        const proxy = this.contextCreator.create(
          contextInstance,
          contextInstance[methodKey],
          moduleKey,
          methodKey,
          contextId,
          wrapper.id,
          defaultCallMetadata,
        );

        const returnValue = proxy(...args);
        if (isEventHandler) {
          return this.forkJoinHandlersIfAttached(
            returnValue,
            [dataOrContextHost, ...args],
            requestScopedHandler,
          );
        }
        return returnValue;
      } catch (err) {
        let exceptionFilter = this.exceptionFiltersCache.get(
          instance[methodKey],
        );
        if (!exceptionFilter) {
          exceptionFilter = this.exceptionFiltersContext.create(
            instance,
            instance[methodKey],
            moduleKey,
          );
          this.exceptionFiltersCache.set(instance[methodKey], exceptionFilter);
        }
        const host = new ExecutionContextHost(args);
        host.setType('rpc');
        return exceptionFilter.handle(err, host);
      }
    };
    return requestScopedHandler;
  }

  /**
   * 获取（或首次生成并缓存）请求上下文 ID，并向容器注册请求级 provider。
   * @param request - RequestContextHost 请求宿主对象
   * @param isTreeDurable - 依赖树是否为 durable（持久缓存）模式
   * @returns 当前请求的 ContextId
   */
  private getContextId<T extends RequestContext = any>(
    request: T,
    isTreeDurable: boolean,
  ): ContextId {
    const contextId = ContextIdFactory.getByRequest(request);
    if (!request[REQUEST_CONTEXT_ID as any]) {
      Object.defineProperty(request, REQUEST_CONTEXT_ID, {
        value: contextId,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      const requestProviderValue = isTreeDurable
        ? contextId.payload
        : Object.assign(request, contextId.payload);
      this.container.registerRequestProvider(requestProviderValue, contextId);
    }
    return contextId;
  }

  /**
   * 将处理器返回值统一转换为 Observable：
   * Promise -> 转 Observable；已是 Observable -> 原样返回；普通值 -> of(value) 包装。
   * @param resultOrDeferred - 处理器返回的任意值
   * @returns 观察结果的 Observable
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
    if (resultOrDeferred instanceof Promise) {
      return fromPromise(resultOrDeferred).pipe(
        mergeMap(val => (isObservable(val) ? val : of(val))),
      );
    }

    if (isObservable(resultOrDeferred)) {
      return resultOrDeferred;
    }

    return of(resultOrDeferred);
  }
}
