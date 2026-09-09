import {
  CUSTOM_ROUTE_ARGS_METADATA,
  PARAMTYPES_METADATA,
} from '@nestjs/common/constants';
import {
  ContextType,
  Controller,
  PipeTransform,
} from '@nestjs/common/interfaces';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { FORBIDDEN_MESSAGE } from '@nestjs/core/guards/constants';
import { GuardsConsumer } from '@nestjs/core/guards/guards-consumer';
import { GuardsContextCreator } from '@nestjs/core/guards/guards-context-creator';
import {
  ContextUtils,
  ParamProperties,
} from '@nestjs/core/helpers/context-utils';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { HandlerMetadataStorage } from '@nestjs/core/helpers/handler-metadata-storage';
import { ParamsMetadata } from '@nestjs/core/helpers/interfaces';
import { STATIC_CONTEXT } from '@nestjs/core/injector/constants';
import { InterceptorsConsumer } from '@nestjs/core/interceptors/interceptors-consumer';
import { InterceptorsContextCreator } from '@nestjs/core/interceptors/interceptors-context-creator';
import { PipesConsumer } from '@nestjs/core/pipes/pipes-consumer';
import { PipesContextCreator } from '@nestjs/core/pipes/pipes-context-creator';
import { Observable } from 'rxjs';
import { PARAM_ARGS_METADATA } from '../constants';
import { RpcException } from '../exceptions';
import { RpcParamsFactory } from '../factories/rpc-params-factory';
import { ExceptionFiltersContext } from './exception-filters-context';
import { DEFAULT_CALLBACK_METADATA } from './rpc-metadata-constants';
import { RpcProxy } from './rpc-proxy';

type RpcParamProperties = ParamProperties & { metatype?: any };
/** RPC 处理器的元数据：参数个数、参数类型与参数元数据工厂 */
export interface RpcHandlerMetadata {
  /** 处理器参数总长度 */
  argsLength: number;
  /** 通过设计时反射得到的参数类型 */
  paramtypes: any[];
  /** 按模块 key 延迟解析参数元数据（含 @Payload/@Ctx 等） */
  getParamsMetadata: (moduleKey: string) => RpcParamProperties[];
}

/**
 * RPC 上下文创建器：把“一个消息处理器方法”包装成可被服务端调用的代理函数。
 * 该代理在每次消息到达时按序执行：
 * Guard（canActivate） -> 拦截器 -> 参数提取与管道校验 -> 目标方法调用，
 * 并在最外层套上异常过滤器（RpcExceptionsHandler）兜底。
 * 处理器元数据（参数个数/类型）会被缓存以提升性能。
 */
export class RpcContextCreator {
  private readonly contextUtils = new ContextUtils();
  private readonly rpcParamsFactory = new RpcParamsFactory();
  private readonly handlerMetadataStorage =
    new HandlerMetadataStorage<RpcHandlerMetadata>();

  constructor(
    private readonly rpcProxy: RpcProxy,
    private readonly exceptionFiltersContext: ExceptionFiltersContext,
    private readonly pipesContextCreator: PipesContextCreator,
    private readonly pipesConsumer: PipesConsumer,
    private readonly guardsContextCreator: GuardsContextCreator,
    private readonly guardsConsumer: GuardsConsumer,
    private readonly interceptorsContextCreator: InterceptorsContextCreator,
    private readonly interceptorsConsumer: InterceptorsConsumer,
  ) {}

  /**
   * 创建处理器代理函数，流程：
   * 1. 读取（并缓存）处理器元数据：参数长度、参数类型与参数元数据工厂；
   * 2. 分别创建异常过滤器、管道、Guard、拦截器上下文；
   * 3. 解析参数元数据并合并参数类型，构造“参数提取 + 管道处理”函数；
   * 4. 构造 Guard 激活函数（未通过则抛 RpcException FORBIDDEN）；
   * 5. 组装 handler：先管道处理参数，再以实例为 this 调用目标方法；
   * 6. 用 RpcProxy 包装：内部按序执行 Guard -> 拦截器 -> handler，外层套异常过滤器。
   * @param instance - 控制器实例
   * @param callback - 目标处理器方法
   * @param moduleKey - 模块 key
   * @param methodName - 方法名
   * @param contextId - 上下文 ID（静态或请求级）
   * @param inquirerId - 请求发起者 ID（请求作用域）
   * @param defaultCallMetadata - 无参数装饰器时使用的默认元数据
   * @returns 消息到达时调用的代理函数，返回 Observable
   */
  public create<T extends ParamsMetadata = ParamsMetadata>(
    instance: Controller,
    callback: (...args: unknown[]) => Observable<any>,
    moduleKey: string,
    methodName: string,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
    defaultCallMetadata: Record<string, any> = DEFAULT_CALLBACK_METADATA,
  ): (...args: any[]) => Promise<Observable<any>> {
    const contextType: ContextType = 'rpc';
    const { argsLength, paramtypes, getParamsMetadata } = this.getMetadata<T>(
      instance,
      methodName,
      defaultCallMetadata,
      contextType,
    );

    const exceptionHandler = this.exceptionFiltersContext.create(
      instance,
      callback,
      moduleKey,
      contextId,
      inquirerId,
    );
    const pipes = this.pipesContextCreator.create(
      instance,
      callback,
      moduleKey,
      contextId,
      inquirerId,
    );
    const guards = this.guardsContextCreator.create(
      instance,
      callback,
      moduleKey,
      contextId,
      inquirerId,
    );
    const interceptors = this.interceptorsContextCreator.create(
      instance,
      callback,
      moduleKey,
      contextId,
      inquirerId,
    );

    const paramsMetadata = getParamsMetadata(moduleKey);
    const paramsOptions = paramsMetadata
      ? this.contextUtils.mergeParamsMetatypes(paramsMetadata, paramtypes)
      : [];
    const fnApplyPipes = this.createPipesFn(pipes, paramsOptions);

    const fnCanActivate = this.createGuardsFn(
      guards,
      instance,
      callback,
      contextType,
    );

    const handler = (initialArgs: unknown[], args: unknown[]) => async () => {
      if (fnApplyPipes) {
        await fnApplyPipes(initialArgs, ...args);
        return callback.apply(instance, initialArgs);
      }
      return callback.apply(instance, args);
    };

    return this.rpcProxy.create(async (...args: unknown[]) => {
      const initialArgs = this.contextUtils.createNullArray(argsLength);
      fnCanActivate && (await fnCanActivate(args));

      return this.interceptorsConsumer.intercept(
        interceptors,
        args,
        instance,
        callback,
        handler(initialArgs, args),
        contextType,
      ) as Promise<Observable<unknown>>;
    }, exceptionHandler);
  }

  /**
   * 反射处理器方法的运行时参数类型（PARAMTYPES_METADATA）。
   * @param instance - 控制器实例
   * @param callback - 处理器方法
   * @returns 参数类型数组
   */
  public reflectCallbackParamtypes(
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
  ): unknown[] {
    return Reflect.getMetadata(PARAMTYPES_METADATA, instance, callback.name);
  }

  /**
   * 创建 Guard 激活函数：依次执行 guards，任一未放行则抛出 RpcException(FORBIDDEN_MESSAGE)；
   * 无 Guard 时返回 null。
   * @param guards - Guard 实例列表
   * @param instance - 控制器实例
   * @param callback - 处理器方法
   * @param contextType - 上下文类型（'rpc'）
   * @returns Guard 激活函数或 null
   */
  public createGuardsFn<TContext extends string = ContextType>(
    guards: any[],
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
    contextType?: TContext,
  ): Function | null {
    const canActivateFn = async (args: any[]) => {
      const canActivate = await this.guardsConsumer.tryActivate<TContext>(
        guards,
        args,
        instance,
        callback,
        contextType,
      );
      if (!canActivate) {
        throw new RpcException(FORBIDDEN_MESSAGE);
      }
    };
    return guards.length ? canActivateFn : null;
  }

  /**
   * 获取（或首次计算并缓存）处理器元数据：
   * 1. 命中 HandlerMetadataStorage 缓存则直接返回；
   * 2. 否则反射参数元数据（PARAM_ARGS_METADATA，如 @Payload/@Ctx 写入的），
   *    计算参数长度与参数类型，并构造 getParamsMetadata 工厂；
   * 3. 缓存后返回。
   * @param instance - 控制器实例
   * @param methodName - 方法名
   * @param defaultCallMetadata - 无参数元数据时的默认值
   * @param contextType - 上下文类型
   * @returns RPC 处理器元数据
   */
  public getMetadata<TMetadata, TContext extends ContextType = ContextType>(
    instance: Controller,
    methodName: string,
    defaultCallMetadata: Record<string, any>,
    contextType: TContext,
  ): RpcHandlerMetadata {
    const cacheMetadata = this.handlerMetadataStorage.get(instance, methodName);
    if (cacheMetadata) {
      return cacheMetadata;
    }
    const metadata =
      this.contextUtils.reflectCallbackMetadata<TMetadata>(
        instance,
        methodName,
        PARAM_ARGS_METADATA,
      ) || defaultCallMetadata;
    const keys = Object.keys(metadata);
    const argsLength = this.contextUtils.getArgumentsLength(keys, metadata);
    const paramtypes = this.contextUtils.reflectCallbackParamtypes(
      instance,
      methodName,
    );
    const contextFactory = this.contextUtils.getContextFactory(
      contextType,
      instance,
      instance[methodName],
    );
    const getParamsMetadata = (moduleKey: string) =>
      this.exchangeKeysForValues(
        keys,
        metadata,
        moduleKey,
        this.rpcParamsFactory,
        contextFactory,
      );

    const handlerMetadata: RpcHandlerMetadata = {
      argsLength,
      paramtypes,
      getParamsMetadata,
    };
    this.handlerMetadataStorage.set(instance, methodName, handlerMetadata);
    return handlerMetadata;
  }

  /**
   * 将参数元数据键转换为“参数提取描述”数组：对每个参数解析出
   * 索引、取值函数（自定义工厂或 RpcParamsFactory）、类型、数据与管道。
   * @param keys - 参数元数据键列表
   * @param metadata - 参数元数据映射
   * @param moduleContext - 模块上下文名
   * @param paramsFactory - RPC 参数工厂（决定 @Ctx/@Payload 等如何取值）
   * @param contextFactory - ExecutionContextHost 构造工厂
   * @returns 参数属性数组
   */
  public exchangeKeysForValues<TMetadata = any>(
    keys: string[],
    metadata: TMetadata,
    moduleContext: string,
    paramsFactory: RpcParamsFactory,
    contextFactory: (args: unknown[]) => ExecutionContextHost,
  ): ParamProperties[] {
    this.pipesContextCreator.setModuleContext(moduleContext);

    return keys.map(key => {
      const { index, data, pipes: pipesCollection } = metadata[key];
      const pipes =
        this.pipesContextCreator.createConcreteContext(pipesCollection);
      const type = this.contextUtils.mapParamType(key);

      if (key.includes(CUSTOM_ROUTE_ARGS_METADATA)) {
        const { factory } = metadata[key];
        const customExtractValue = this.contextUtils.getCustomFactory(
          factory,
          data,
          contextFactory,
        );
        return { index, extractValue: customExtractValue, type, data, pipes };
      }
      const numericType = Number(type);
      const extractValue = (...args: unknown[]) =>
        paramsFactory.exchangeKeyForValue(numericType, data, args);

      return { index, extractValue, type: numericType, data, pipes };
    });
  }

  /**
   * 创建“参数提取 + 管道校验”函数：对每个声明的参数并行执行
   * extractValue 取值后依次套用管道（全局管道 + 参数级管道），写回参数数组。
   * @param pipes - 该处理器的管道列表
   * @param paramsOptions - 各参数的属性描述（含元类型与参数级管道）
   * @returns 管道处理函数，无参数时为 null
   */
  public createPipesFn(
    pipes: PipeTransform[],
    paramsOptions: (ParamProperties & { metatype?: unknown })[],
  ) {
    const pipesFn = async (args: unknown[], ...params: unknown[]) => {
      const resolveParamValue = async (
        param: ParamProperties & { metatype?: unknown },
      ) => {
        const {
          index,
          extractValue,
          type,
          data,
          metatype,
          pipes: paramPipes,
        } = param;
        const value = extractValue(...params);

        args[index] = await this.getParamValue(
          value,
          { metatype, type, data },
          pipes.concat(paramPipes),
        );
      };
      await Promise.all(paramsOptions.map(resolveParamValue));
    };
    return paramsOptions.length ? pipesFn : null;
  }

  /**
   * 对单个参数值依次应用管道转换/校验。
   * @param value - 提取到的原始参数值
   * @param metatype - 参数的元类型信息（metatype/type/data）
   * @param pipes - 待应用的管道列表
   * @returns 管道处理后的值
   */
  public async getParamValue<T>(
    value: T,
    { metatype, type, data }: { metatype: any; type: any; data: any },
    pipes: PipeTransform[],
  ): Promise<any> {
    return isEmpty(pipes)
      ? value
      : this.pipesConsumer.apply(value, { metatype, type, data }, pipes);
  }
}
