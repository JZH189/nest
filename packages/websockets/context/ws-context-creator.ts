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
import {
  InterceptorsConsumer,
  InterceptorsContextCreator,
} from '@nestjs/core/interceptors';
import { PipesConsumer, PipesContextCreator } from '@nestjs/core/pipes';
import { MESSAGE_METADATA, PARAM_ARGS_METADATA } from '../constants';
import { WsException } from '../errors/ws-exception';
import { WsParamsFactory } from '../factories/ws-params-factory';
import { ExceptionFiltersContext } from './exception-filters-context';
import { DEFAULT_CALLBACK_METADATA } from './ws-metadata-constants';
import { WsProxy } from './ws-proxy';

type WsParamProperties = ParamProperties & { metatype?: any };
/**
 * WebSocket 处理方法的元数据描述：参数个数、参数类型以及延迟解析的参数元信息。
 */
export interface WsHandlerMetadata {
  /** 方法声明的参数总个数。 */
  argsLength: number;
  /** 通过设计时元数据（emitDecoratorTypeMetadata）获取的参数类型数组。 */
  paramtypes: any[];
  /** 按模块键延迟解析参数元数据（含每个参数的取值函数与管道）的工厂函数。 */
  getParamsMetadata: (moduleKey: string) => WsParamProperties[];
}

/**
 * WebSocket 上下文创建器（WsContextCreator）：网关消息处理方法的“中间件装配器”。
 *
 * 它把 @SubscribeMessage 标记的原始方法回调包装为一个完整处理器，执行顺序为：
 * 守卫（CanActivate） -> 拦截器（intercept） -> 参数管道（pipes） -> 方法回调，
 * 同步异常与 Promise 拒绝均通过 WsProxy 交给 WebSocket 异常过滤器处理。
 *
 * 与 HTTP 侧的 RouterProxyFactory/ContextCreator 机制同构，但上下文类型为 'ws'，
 * 参数值由 WsParamsFactory 从 socket 客户端/消息数据中提取。
 */
export class WsContextCreator {
  private readonly contextUtils = new ContextUtils();
  /** WebSocket 参数工厂：根据参数类型（SOCKET/BODY/ACK）从运行时参数中提取实际值。 */
  private readonly wsParamsFactory = new WsParamsFactory();
  /** 处理方法元数据缓存，避免重复反射（同一实例同一方法只解析一次）。 */
  private readonly handlerMetadataStorage =
    new HandlerMetadataStorage<WsHandlerMetadata>();

  constructor(
    /** 函数代理：捕获异常并路由到异常过滤器。 */
    private readonly wsProxy: WsProxy,
    /** 异常过滤器上下文创建器。 */
    private readonly exceptionFiltersContext: ExceptionFiltersContext,
    /** 管道上下文创建器。 */
    private readonly pipesContextCreator: PipesContextCreator,
    /** 管道消费者（真正执行管道转换）。 */
    private readonly pipesConsumer: PipesConsumer,
    /** 守卫上下文创建器。 */
    private readonly guardsContextCreator: GuardsContextCreator,
    /** 守卫消费者（真正执行 canActivate）。 */
    private readonly guardsConsumer: GuardsConsumer,
    /** 拦截器上下文创建器。 */
    private readonly interceptorsContextCreator: InterceptorsContextCreator,
    /** 拦截器消费者（真正执行 intercept 链）。 */
    private readonly interceptorsConsumer: InterceptorsConsumer,
  ) {}

  /**
   * 为网关的一个消息处理方法创建增强处理器（核心方法）。
   *
   * 处理步骤：
   * 1. 读取方法元数据（参数长度、参数类型、参数元信息工厂），上下文类型为 'ws'；
   * 2. 分别创建异常过滤器、管道、守卫、拦截器四个上下文；
   * 3. 解析参数元数据并与参数类型合并，构造“应用管道”函数 fnApplyPipes；
   * 4. 构造“守卫检查”函数 fnCanActivate；
   * 5. 定义 handler：若有管道则先转换参数值再用 initialArgs 调用原方法，
   *    否则直接用原始 args 调用；
   * 6. 读取消息模式（@SubscribeMessage 的消息名），最终通过 WsProxy.create
   *    将全部逻辑包装为带异常处理的最终处理器，运行时会先 push 消息模式、
   *    建立空参数数组、执行守卫，再进入拦截器链。
   *
   * @param instance - 网关（控制器）实例。
   * @param callback - 原始消息处理方法回调。
   * @param moduleKey - 所在模块的标识（用于解析模块级 provider）。
   * @param methodName - 方法名。
   * @returns 包装完成的异步处理器，形参为 [client, data, ack?]。
   */
  public create<T extends ParamsMetadata = ParamsMetadata>(
    instance: Controller,
    callback: (...args: unknown[]) => void,
    moduleKey: string,
    methodName: string,
  ): (...args: any[]) => Promise<void> {
    const contextType: ContextType = 'ws';
    const { argsLength, paramtypes, getParamsMetadata } = this.getMetadata<T>(
      instance,
      methodName,
      contextType,
    );
    const exceptionHandler = this.exceptionFiltersContext.create(
      instance,
      callback,
      moduleKey,
    );
    const pipes = this.pipesContextCreator.create(
      instance,
      callback,
      moduleKey,
    );
    const guards = this.guardsContextCreator.create(
      instance,
      callback,
      moduleKey,
    );
    const interceptors = this.interceptorsContextCreator.create(
      instance,
      callback,
      moduleKey,
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
    const targetPattern = this.reflectCallbackPattern(callback);
    return this.wsProxy.create(
      async (...args: unknown[]) => {
        args.push(targetPattern);

        const initialArgs = this.contextUtils.createNullArray(argsLength);
        fnCanActivate && (await fnCanActivate(args));

        return this.interceptorsConsumer.intercept(
          interceptors,
          args,
          instance,
          callback,
          handler(initialArgs, args),
          contextType,
        );
      },
      exceptionHandler,
      targetPattern,
    );
  }

  /**
   * 反射获取处理方法的参数类型（设计时类型元数据）。
   *
   * @param instance - 网关实例。
   * @param callback - 处理方法回调。
   * @returns 参数类型数组（未启用 emitDecoratorMetadata 时可能为 undefined）。
   */
  public reflectCallbackParamtypes(
    instance: Controller,
    callback: (...args: any[]) => any,
  ): any[] {
    return Reflect.getMetadata(PARAMTYPES_METADATA, instance, callback.name);
  }

  /**
   * 读取回调订阅的消息模式（@SubscribeMessage 的消息名）。
   *
   * @param callback - 处理方法回调。
   * @returns 消息名（如 "message"），用于运行时消息匹配与异常信息。
   */
  public reflectCallbackPattern(callback: (...args: any[]) => any): string {
    return Reflect.getMetadata(MESSAGE_METADATA, callback);
  }

  /**
   * 创建守卫执行函数：依次调用所有守卫，任一守卫拒绝时抛出 WsException(FORBIDDEN_MESSAGE)。
   *
   * @param guards - 已实例化的守卫数组。
   * @param instance - 网关实例。
   * @param callback - 处理方法回调。
   * @param contextType - 上下文类型（'ws'）。
   * @returns 守卫检查函数；无守卫时返回 null。
   */
  public createGuardsFn<TContext extends string = ContextType>(
    guards: any[],
    instance: Controller,
    callback: (...args: unknown[]) => any,
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
        throw new WsException(FORBIDDEN_MESSAGE);
      }
    };
    return guards.length ? canActivateFn : null;
  }

  /**
   * 获取处理方法的元数据（带缓存）。
   *
   * 处理步骤：
   * 1. 先查 HandlerMetadataStorage 缓存，命中则直接返回；
   * 2. 反射参数装饰器元数据（PARAM_ARGS_METADATA），缺失时使用空默认值；
   * 3. 根据元数据键计算参数总个数 argsLength，并反射参数类型 paramtypes；
   * 4. 创建 ExecutionContextHost 工厂（getParamsMetadata 调用时用它构造上下文）；
   * 5. 组装 WsHandlerMetadata 并写入缓存后返回。
   *
   * @param instance - 网关实例。
   * @param methodName - 方法名。
   * @param contextType - 上下文类型（'ws'）。
   * @returns 处理方法的元数据对象。
   */
  public getMetadata<TMetadata, TContext extends ContextType = ContextType>(
    instance: Controller,
    methodName: string,
    contextType: TContext,
  ): WsHandlerMetadata {
    const cacheMetadata = this.handlerMetadataStorage.get(instance, methodName);
    if (cacheMetadata) {
      return cacheMetadata;
    }
    const metadata =
      this.contextUtils.reflectCallbackMetadata<TMetadata>(
        instance,
        methodName,
        PARAM_ARGS_METADATA,
      ) || DEFAULT_CALLBACK_METADATA;
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
        this.wsParamsFactory,
        contextFactory,
      );

    const handlerMetadata: WsHandlerMetadata = {
      argsLength,
      paramtypes,
      getParamsMetadata,
    };
    this.handlerMetadataStorage.set(instance, methodName, handlerMetadata);
    return handlerMetadata;
  }

  /**
   * 将参数元数据键转换为“参数取值器”数组（ContextCreator 模式的核心实现）。
   *
   * 处理步骤：
   * 1. 设置管道上下文的模块上下文（moduleContext），保证能解析模块级 provider；
   * 2. 遍历每个元数据键，解析参数索引、数据与参数级管道；
   * 3. 若是自定义参数装饰器（含 CUSTOM_ROUTE_ARGS_METADATA），
   *    则用用户提供的工厂函数提取值；
   * 4. 否则用 WsParamsFactory.exchangeKeyForValue 按数值类型提取值
   *    （从 socket 客户端、消息数据、ACK 回调等取值）。
   *
   * @param keys - 元数据键数组。
   * @param metadata - 参数装饰器元数据。
   * @param moduleContext - 模块标识。
   * @param paramsFactory - WebSocket 参数工厂。
   * @param contextFactory - ExecutionContextHost 工厂（供自定义装饰器工厂使用）。
   * @returns 每个参数的 {index, extractValue, type, data, pipes} 描述数组。
   */
  public exchangeKeysForValues<TMetadata = any>(
    keys: string[],
    metadata: TMetadata,
    moduleContext: string,
    paramsFactory: WsParamsFactory,
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
      const extractValue = (...args: any[]) =>
        paramsFactory.exchangeKeyForValue(numericType, data, args);

      return { index, extractValue, type: numericType, data, pipes };
    });
  }

  /**
   * 创建“参数管道应用”函数：为每个参数提取实际值并依次通过管道转换，
   * 最终写回参数数组的对应位置。
   *
   * 处理步骤：
   * 1. 定义 pipesFn，内部对每个参数并发执行 resolveParamValue；
   * 2. resolveParamValue 先用 extractValue 从运行时参数中提取原始值；
   * 3. 将全局管道与参数级管道合并后交给 pipesConsumer.apply 转换；
   * 4. 转换结果写入 args[index]；
   * 5. 无参数元信息时返回 null（跳过管道处理）。
   *
   * @param pipes - 方法级（全局）管道实例数组。
   * @param paramsOptions - 各参数的元信息（索引、取值器、元类型、管道等）。
   * @returns 管道应用函数；无参数时返回 null。
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
   * 对单个参数值应用管道转换。
   *
   * @param value - 参数的原始值。
   * @param metadata - 包含 metatype/type/data 的元信息对象。
   * @param pipes - 要应用的管道数组。
   * @returns 管道转换后的参数值（无管道时原样返回）。
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
