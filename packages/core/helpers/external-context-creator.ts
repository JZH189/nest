import { ForbiddenException, ParamData } from '@nestjs/common';
import { CUSTOM_ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import {
  ContextType,
  Controller,
  PipeTransform,
} from '@nestjs/common/interfaces';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { isObservable, lastValueFrom } from 'rxjs';
import { ExternalExceptionFilterContext } from '../exceptions/external-exception-filter-context';
import { GuardsConsumer, GuardsContextCreator } from '../guards';
import { FORBIDDEN_MESSAGE } from '../guards/constants';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { ContextId } from '../injector/instance-wrapper';
import { ModulesContainer } from '../injector/modules-container';
import {
  InterceptorsConsumer,
  InterceptorsContextCreator,
} from '../interceptors';
import { PipesConsumer, PipesContextCreator } from '../pipes';
import { ContextUtils, ParamProperties } from './context-utils';
import { ExternalErrorProxy } from './external-proxy';
import { HandlerMetadataStorage } from './handler-metadata-storage';
import { ExternalHandlerMetadata } from './interfaces/external-handler-metadata.interface';
import { ParamsMetadata } from './interfaces/params-metadata.interface';

/**
 * 参数工厂接口：把参数元数据键（数字类型 + data）兑换成实际的参数值。
 * 由各传输层（HTTP/RPC/WS）提供各自的实现。
 */
export interface ParamsFactory {
  /**
   * 根据参数类型编号与装饰器数据从当前调用参数中提取值。
   * @param type - 参数类型编号（由装饰器元数据键解析而来）
   * @param data - 装饰器携带的数据（如 @Param('id') 的 'id'）
   * @param args - 当前的路由参数数组
   * @returns 提取到的参数值
   */
  exchangeKeyForValue(type: number, data: ParamData, args: any): any;
}

/**
 * 外部上下文创建选项：可按需关闭守卫/拦截器/异常过滤器三段流程，
 * 供不同适配器（如微服务、GraphQL）定制请求管道组成。
 */
export interface ExternalContextOptions {
  /** 是否启用守卫（在拦截器之前执行） */
  guards?: boolean;
  /** 是否启用拦截器 */
  interceptors?: boolean;
  /** 是否启用（外部）异常过滤器代理 */
  filters?: boolean;
}

/**
 * 外部上下文创建器：为“非框架路由工厂托管”的处理器（微服务、WebSocket
 * 网关、GraphQL 解析器等，即通过 ExternalContextCreator 直接包装的方法）
 * 组装完整的请求管道。
 *
 * 在框架中的角色：它是普通路由（RouterProxy）流程的外部等价物，负责把
 * 守卫 → 拦截器 → 管道/参数绑定 → 处理器 → 异常过滤器这条链拼接成一个
 * 可直接调用的代理函数。管道执行顺序沿用框架约定：守卫在中间件之后、
 * 拦截器之前执行。
 */
export class ExternalContextCreator {
  private readonly contextUtils = new ContextUtils();
  private readonly externalErrorProxy = new ExternalErrorProxy();
  private readonly handlerMetadataStorage =
    new HandlerMetadataStorage<ExternalHandlerMetadata>();
  private container: NestContainer;

  constructor(
    private readonly guardsContextCreator: GuardsContextCreator,
    private readonly guardsConsumer: GuardsConsumer,
    private readonly interceptorsContextCreator: InterceptorsContextCreator,
    private readonly interceptorsConsumer: InterceptorsConsumer,
    private readonly modulesContainer: ModulesContainer,
    private readonly pipesContextCreator: PipesContextCreator,
    private readonly pipesConsumer: PipesConsumer,
    private readonly filtersContextCreator: ExternalExceptionFilterContext,
  ) {}

  /**
   * 基于 DI 容器构造一个 ExternalContextCreator 实例（装配全部子组件）。
   * @param container - Nest DI 容器
   * @returns 配置完成的 ExternalContextCreator
   */
  static fromContainer(container: NestContainer): ExternalContextCreator {
    const guardsContextCreator = new GuardsContextCreator(
      container,
      container.applicationConfig,
    );
    const guardsConsumer = new GuardsConsumer();
    const interceptorsContextCreator = new InterceptorsContextCreator(
      container,
      container.applicationConfig,
    );
    const interceptorsConsumer = new InterceptorsConsumer();
    const pipesContextCreator = new PipesContextCreator(
      container,
      container.applicationConfig,
    );
    const pipesConsumer = new PipesConsumer();
    const filtersContextCreator = new ExternalExceptionFilterContext(
      container,
      container.applicationConfig,
    );

    const externalContextCreator = new ExternalContextCreator(
      guardsContextCreator,
      guardsConsumer,
      interceptorsContextCreator,
      interceptorsConsumer,
      container.getModules(),
      pipesContextCreator,
      pipesConsumer,
      filtersContextCreator,
    );
    externalContextCreator.container = container;
    return externalContextCreator;
  }

  /**
   * 把一个（外部传输层的）处理器方法包装成带完整管道的代理函数。
   * @param instance - 处理器所属实例（如控制器/解析器）
   * @param callback - 原始处理方法
   * @param methodName - 方法名（用于元数据反射与缓存）
   * @param metadataKey - 参数元数据键（如 ROUTE_ARGS_METADATA）
   * @param paramsFactory - 传输层参数工厂（负责从参数中提取值）
   * @param contextId - 请求上下文 ID（请求级作用域用）
   * @param inquirerId - 请求发起者 ID（瞬态作用域用）
   * @param options - 管道组成开关（守卫/拦截器/过滤器）
   * @param contextType - 上下文类型（'http'、'ws'、'rpc' 等）
   * @returns 包装后的异步代理函数，调用时按顺序执行守卫 → 拦截器 → 管道 → 处理器
   */
  public create<
    TParamsMetadata extends ParamsMetadata = ParamsMetadata,
    TContext extends string = ContextType,
  >(
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
    methodName: string,
    metadataKey?: string,
    paramsFactory?: ParamsFactory,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
    options: ExternalContextOptions = {
      interceptors: true,
      guards: true,
      filters: true,
    },
    contextType: TContext = 'http' as TContext,
  ) {
    // 1. 定位处理器类所属模块，供各上下文创建器解析依赖实例
    const moduleKey = this.getContextModuleKey(instance.constructor);
    // 2. 读取（并缓存）处理器元数据：参数槽长度、参数类型、参数元数据提取器
    const { argsLength, paramtypes, getParamsMetadata } = this.getMetadata<
      TParamsMetadata,
      TContext
    >(instance, methodName, metadataKey, paramsFactory, contextType);
    // 3. 分别编译管道、守卫、异常过滤器与拦截器上下文
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
    const exceptionFilter = this.filtersContextCreator.create(
      instance,
      callback as (...args: any[]) => any,
      moduleKey,
      contextId,
      inquirerId,
    );
    const interceptors = options.interceptors
      ? this.interceptorsContextCreator.create(
          instance,
          callback,
          moduleKey,
          contextId,
          inquirerId,
        )
      : [];

    // 4. 合并参数元数据与参数类型，供管道转换使用
    const paramsMetadata = getParamsMetadata(moduleKey, contextId, inquirerId);
    const paramsOptions = paramsMetadata
      ? this.contextUtils.mergeParamsMetatypes(paramsMetadata, paramtypes)
      : [];

    // 5. 构造守卫校验函数与管道应用函数（按需启用）
    const fnCanActivate = options.guards
      ? this.createGuardsFn(guards, instance, callback, contextType)
      : null;
    const fnApplyPipes = this.createPipesFn(pipes, paramsOptions);
    // 6. 处理器：先跑管道绑定参数，再以实例为 this 调用原方法
    const handler =
      (initialArgs: unknown[], ...args: unknown[]) =>
      async () => {
        if (fnApplyPipes) {
          await fnApplyPipes(initialArgs, ...args);
          return callback.apply(instance, initialArgs);
        }
        return callback.apply(instance, args);
      };

    // 7. 最终目标函数：守卫 → 拦截器（包裹处理器）→ 展平结果
    const target = async (...args: any[]) => {
      const initialArgs = this.contextUtils.createNullArray(argsLength);
      fnCanActivate && (await fnCanActivate(args));

      const result = await this.interceptorsConsumer.intercept(
        interceptors,
        args,
        instance,
        callback,
        handler(initialArgs, ...args),
        contextType,
      );
      return this.transformToResult(result);
    };
    // 8. 按需用外部异常过滤器代理包裹，处理执行期抛出的异常
    return options.filters
      ? this.externalErrorProxy.createProxy(
          target,
          exceptionFilter,
          contextType,
        )
      : target;
  }

  /**
   * 读取并缓存处理器的元数据（参数槽长度、参数类型、参数元数据提取函数）。
   * 元数据按 instance + methodName 缓存，避免每次请求重复反射。
   * @param instance - 处理器所属实例
   * @param methodName - 方法名
   * @param metadataKey - 参数元数据键
   * @param paramsFactory - 传输层参数工厂
   * @param contextType - 上下文类型
   * @returns 处理器元数据对象
   */
  public getMetadata<TMetadata, TContext extends string = ContextType>(
    instance: Controller,
    methodName: string,
    metadataKey?: string,
    paramsFactory?: ParamsFactory,
    contextType?: TContext,
  ): ExternalHandlerMetadata {
    // 命中缓存则直接返回
    const cacheMetadata = this.handlerMetadataStorage.get(instance, methodName);
    if (cacheMetadata) {
      return cacheMetadata;
    }
    const metadata =
      this.contextUtils.reflectCallbackMetadata<TMetadata>(
        instance,
        methodName,
        metadataKey || '',
      ) || {};
    const keys = Object.keys(metadata);
    const argsLength = this.contextUtils.getArgumentsLength(keys, metadata);
    const paramtypes = this.contextUtils.reflectCallbackParamtypes(
      instance,
      methodName,
    );
    const contextFactory = this.contextUtils.getContextFactory<TContext>(
      contextType!,
      instance,
      instance[methodName],
    );
    // 延迟提取参数元数据：需要时才结合模块上下文与上下文 ID 解析
    const getParamsMetadata = (
      moduleKey: string,
      contextId = STATIC_CONTEXT,
      inquirerId?: string,
    ) =>
      paramsFactory
        ? this.exchangeKeysForValues(
            keys,
            metadata,
            moduleKey,
            paramsFactory,
            contextId,
            inquirerId,
            contextFactory,
          )
        : null;

    const handlerMetadata: ExternalHandlerMetadata = {
      argsLength,
      paramtypes,
      getParamsMetadata: getParamsMetadata as any,
    };
    this.handlerMetadataStorage.set(instance, methodName, handlerMetadata);
    return handlerMetadata;
  }

  /**
   * 查找模块构造函数在模块容器中所属模块的 key。
   * @param moduleCtor - 模块（或处理器）构造函数
   * @returns 所属模块的 key；找不到时返回空字符串
   */
  public getContextModuleKey(moduleCtor: Function | undefined): string {
    const emptyModuleKey = '';
    if (!moduleCtor) {
      return emptyModuleKey;
    }
    // 遍历全部模块，找到注册了该构造函数的模块
    const moduleContainerEntries = this.modulesContainer.entries();
    for (const [key, moduleRef] of moduleContainerEntries) {
      if (moduleRef.hasProvider(moduleCtor)) {
        return key;
      }
    }
    return emptyModuleKey;
  }

  /**
   * 把参数元数据键列表兑换成 ParamProperties 数组：
   * 为每个参数生成值提取函数（含自定义装饰器工厂）并编译其管道。
   * @param keys - 参数元数据键列表（如 '0:body'、'1:query:id'）
   * @param metadata - 参数元数据映射
   * @param moduleContext - 所属模块 key
   * @param paramsFactory - 传输层参数工厂
   * @param contextId - 请求上下文 ID
   * @param inquirerId - 请求发起者 ID
   * @param contextFactory - 执行上下文工厂（供自定义工厂使用）
   * @returns 参数属性数组（含 extractValue、pipes 等）
   */
  public exchangeKeysForValues<TMetadata = any>(
    keys: string[],
    metadata: TMetadata,
    moduleContext: string,
    paramsFactory: ParamsFactory,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
    contextFactory = this.contextUtils.getContextFactory('http'),
  ): ParamProperties[] {
    this.pipesContextCreator.setModuleContext(moduleContext);

    return keys.map(key => {
      const { index, data, pipes: pipesCollection } = metadata[key];
      const pipes = this.pipesContextCreator.createConcreteContext(
        pipesCollection,
        contextId,
        inquirerId,
      );
      const type = this.contextUtils.mapParamType(key);

      if (key.includes(CUSTOM_ROUTE_ARGS_METADATA)) {
        // 自定义参数装饰器：使用用户注册的工厂函数提取值
        const { factory } = metadata[key];
        const customExtractValue = this.contextUtils.getCustomFactory(
          factory,
          data,
          contextFactory,
        );
        return { index, extractValue: customExtractValue, type, data, pipes };
      }
      // 内置参数装饰器：交由传输层的 paramsFactory 按类型编号提取值
      const numericType = Number(type);
      const extractValue = (...args: unknown[]) =>
        paramsFactory.exchangeKeyForValue(numericType, data, args);

      return { index, extractValue, type: numericType, data, pipes };
    });
  }

  /**
   * 创建“参数绑定 + 管道转换”函数：为每个参数提取值并依次通过管道处理，
   * 多个参数并行处理；无参数元数据时返回 null 跳过该阶段。
   * @param pipes - 处理器级管道实例数组
   * @param paramsOptions - 参数属性（含 metatype）数组
   * @returns 异步的参数绑定函数；无可绑定参数时返回 null
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
   * 对提取出的参数值应用管道链（转换 + 校验）。
   * @param value - 原始参数值
   * @param metatype - 参数类型/数据元信息（metatype、type、data）
   * @param pipes - 应用于该值的管道数组
   * @returns 管道处理后的最终值
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

  /**
   * 展平处理结果：Observable 转为最后一个值，其余原样返回。
   * @param resultOrDeferred - 处理器/拦截器返回的结果
   * @returns 展平后的结果
   */
  public async transformToResult(resultOrDeferred: any) {
    if (isObservable(resultOrDeferred)) {
      return lastValueFrom(resultOrDeferred);
    }
    return resultOrDeferred;
  }

  /**
   * 创建守卫校验函数：依次执行守卫，任一拒绝即抛出 ForbiddenException。
   * @param guards - 守卫实例数组
   * @param instance - 控制器实例
   * @param callback - 路由处理方法
   * @param contextType - 上下文类型
   * @returns 守卫校验函数；无守卫时返回 null
   */
  public createGuardsFn<TContext extends string = ContextType>(
    guards: any[],
    instance: Controller,
    callback: (...args: any[]) => any,
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
        throw new ForbiddenException(FORBIDDEN_MESSAGE);
      }
    };
    return guards.length ? canActivateFn : null;
  }

  /**
   * 向 DI 容器注册当前请求对象（REQUEST 作用域提供者绑定）。
   * @param request - 请求对象
   * @param contextId - 请求上下文 ID
   */
  public registerRequestProvider<T = any>(request: T, contextId: ContextId) {
    this.container.registerRequestProvider<T>(request, contextId);
  }
}
