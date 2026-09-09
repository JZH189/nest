import {
  CanActivate,
  ForbiddenException,
  HttpServer,
  ParamData,
  PipeTransform,
  RequestMethod,
} from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  REDIRECT_METADATA,
  RENDER_METADATA,
  ROUTE_ARGS_METADATA,
  SSE_METADATA,
} from '@nestjs/common/constants';
import { RouteParamMetadata } from '@nestjs/common/decorators';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ContextType, Controller } from '@nestjs/common/interfaces';
import { isEmpty, isString } from '@nestjs/common/utils/shared.utils';
import { IncomingMessage } from 'http';
import { Observable } from 'rxjs';
import {
  FORBIDDEN_MESSAGE,
  GuardsConsumer,
  GuardsContextCreator,
} from '../guards';
import { ContextUtils } from '../helpers/context-utils';
import { ExecutionContextHost } from '../helpers/execution-context-host';
import {
  HandleResponseFn,
  HandlerMetadata,
  HandlerMetadataStorage,
  HandlerResponseBasicFn,
} from '../helpers/handler-metadata-storage';
import { STATIC_CONTEXT } from '../injector/constants';
import { InterceptorsConsumer } from '../interceptors/interceptors-consumer';
import { InterceptorsContextCreator } from '../interceptors/interceptors-context-creator';
import { PipesConsumer } from '../pipes/pipes-consumer';
import { PipesContextCreator } from '../pipes/pipes-context-creator';
import { IRouteParamsFactory } from './interfaces/route-params-factory.interface';
import {
  CustomHeader,
  RedirectResponse,
  RouterResponseController,
} from './router-response-controller';
import { HeaderStream } from './sse-stream';

/**
 * 单个路由参数的属性描述。
 *
 * 在框架中的角色：RouterExecutionContext 把控制器方法上每个参数装饰器的元数据
 * 解析成该结构，包含参数位置、来源类型、装饰器数据、绑定的管道，
 * 以及一个"提取函数"（运行时从 req/res/next 中取出实际值）。
 */
export interface ParamProperties {
  /** 参数在方法签名中的位置索引。 */
  index: number;
  /** 参数来源类型（RouteParamtypes 枚举值，或自定义装饰器的字符串 key）。 */
  type: RouteParamtypes | string;
  /** 装饰器传入的数据（如 @Query('id') 的 'id'）。 */
  data: ParamData;
  /** 绑定到该参数的管道实例列表。 */
  pipes: PipeTransform[];
  /** 提取函数：在请求到来时从请求/响应对象中取出参数值。 */
  extractValue: <TRequest, TResponse>(
    req: TRequest,
    res: TResponse,
    next: Function,
  ) => any;
}

/**
 * 路由执行上下文：把控制器方法包装成完整请求处理函数的核心。
 *
 * 在框架中的角色：RouterExplorer 为每个（静态作用域的）路由调用 create，
 * 得到一个 async (req, res, next) 处理函数。其执行管线为：
 * 守卫（Guards）-> 设置状态码/响应头 -> 拦截器（Interceptors，前置/后置）->
 * 管道（Pipes，参数提取与转换）-> 调用控制器方法 -> 响应处理
 * （普通返回/重定向/模板渲染/SSE）。方法元数据（参数、状态码、响应头等）
 * 会被缓存到 HandlerMetadataStorage，避免每次注册重复反射。
 */
export class RouterExecutionContext {
  private readonly handlerMetadataStorage = new HandlerMetadataStorage();
  private readonly contextUtils = new ContextUtils();
  private readonly responseController: RouterResponseController;

  constructor(
    private readonly paramsFactory: IRouteParamsFactory,
    private readonly pipesContextCreator: PipesContextCreator,
    private readonly pipesConsumer: PipesConsumer,
    private readonly guardsContextCreator: GuardsContextCreator,
    private readonly guardsConsumer: GuardsConsumer,
    private readonly interceptorsContextCreator: InterceptorsContextCreator,
    private readonly interceptorsConsumer: InterceptorsConsumer,
    readonly applicationRef: HttpServer,
  ) {
    this.responseController = new RouterResponseController(applicationRef);
  }

  /**
   * 为指定控制器方法创建最终的 HTTP 请求处理函数（核心方法）。
   *
   * @param instance - 控制器实例。
   * @param callback - 被装饰的控制器方法。
   * @param methodName - 方法名。
   * @param moduleKey - 所属模块 key。
   * @param requestMethod - HTTP 请求方法。
   * @param contextId - 上下文 ID（用于请求作用域提供者解析）。
   * @param inquirerId - 请求发起者 ID。
   * @returns async (req, res, next) 形式的处理函数：依次执行守卫、
   *          设置状态码/响应头、拦截器、管道与参数注入、方法调用、响应处理。
   */
  public create(
    instance: Controller,
    callback: (...args: any[]) => unknown,
    methodName: string,
    moduleKey: string,
    requestMethod: RequestMethod,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ) {
    const contextType: ContextType = 'http';
    // 1. 读取并缓存方法元数据：参数数量、参数元数据、参数类型、状态码、响应头等
    const {
      argsLength,
      fnHandleResponse,
      paramtypes,
      getParamsMetadata,
      httpStatusCode,
      responseHeaders,
      hasCustomHeaders,
    } = this.getMetadata(
      instance,
      callback,
      methodName,
      moduleKey,
      requestMethod,
      contextType,
    );

    // 2. 合并参数元数据与参数类型（metatype），供管道使用
    const paramsOptions = this.contextUtils.mergeParamsMetatypes(
      getParamsMetadata(moduleKey, contextId, inquirerId),
      paramtypes,
    );
    // 3. 收集全局/控制器/方法各级绑定的管道、守卫、拦截器实例
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

    // 4. 构建守卫执行函数与管道执行函数（惰性：无守卫/参数时为 null）
    const fnCanActivate = this.createGuardsFn(
      guards,
      instance,
      callback,
      contextType,
    );
    const fnApplyPipes = this.createPipesFn(pipes, paramsOptions);

    // 5. 构建核心 handler：先执行管道填充参数数组 args，再调用控制器方法
    const handler =
      <TRequest, TResponse>(
        args: any[],
        req: TRequest,
        res: TResponse,
        next: Function,
      ) =>
      async () => {
        fnApplyPipes && (await fnApplyPipes(args, req, res, next));
        return callback.apply(instance, args);
      };

    // 6. 返回最终处理函数：守卫 -> 状态码/响应头 -> 拦截器（包裹 handler）-> 响应处理
    return async <TRequest, TResponse>(
      req: TRequest,
      res: TResponse,
      next: Function,
    ) => {
      // 6.1 创建与参数数量等长的 null 数组，用于装配实际参数值
      const args = this.contextUtils.createNullArray(argsLength);
      // 6.2 执行守卫链，全部通过才继续；否则抛出 ForbiddenException
      fnCanActivate && (await fnCanActivate([req, res, next]));

      // 6.3 设置响应状态码与自定义响应头（@HttpCode / @Header）
      this.responseController.setStatus(res, httpStatusCode);
      hasCustomHeaders &&
        this.responseController.setHeaders(res, responseHeaders);

      // 6.4 执行拦截器链：前置逻辑 -> handler（管道 + 控制器方法）-> 后置逻辑
      const result = await this.interceptorsConsumer.intercept(
        interceptors,
        [req, res, next],
        instance,
        callback,
        handler(args, req, res, next),
        contextType,
      );
      // 6.5 处理最终结果：序列化并写回响应（或重定向/渲染/SSE）
      await (fnHandleResponse as HandlerResponseBasicFn)(result, res, req);
    };
  }

  /**
   * 读取（并缓存）控制器方法的全部运行时元数据。
   *
   * 包括：参数元数据（ROUTE_ARGS_METADATA）与参数个数、参数类型（paramtypes）、
   * 参数元数据的惰性解析函数（请求作用域时每次请求重新解析）、HTTP 状态码、
   * 自定义响应头、响应处理函数等。结果按 instance + methodName 缓存。
   *
   * @param instance - 控制器实例。
   * @param callback - 控制器方法。
   * @param methodName - 方法名。
   * @param moduleKey - 所属模块 key。
   * @param requestMethod - HTTP 请求方法。
   * @param contextType - 上下文类型（'http'）。
   * @returns 汇总后的 HandlerMetadata。
   */
  public getMetadata<TContext extends ContextType = ContextType>(
    instance: Controller,
    callback: (...args: any[]) => any,
    methodName: string,
    moduleKey: string,
    requestMethod: RequestMethod,
    contextType: TContext,
  ): HandlerMetadata {
    const cacheMetadata = this.handlerMetadataStorage.get(instance, methodName);
    if (cacheMetadata) {
      return cacheMetadata;
    }
    const metadata =
      this.contextUtils.reflectCallbackMetadata(
        instance,
        methodName,
        ROUTE_ARGS_METADATA,
      ) || {};
    const keys = Object.keys(metadata);
    const argsLength = this.contextUtils.getArgumentsLength(keys, metadata);
    const paramtypes = this.contextUtils.reflectCallbackParamtypes(
      instance,
      methodName,
    );

    const contextFactory = this.contextUtils.getContextFactory(
      contextType,
      instance,
      callback,
    );
    const getParamsMetadata = (
      moduleKey: string,
      contextId = STATIC_CONTEXT,
      inquirerId?: string,
    ) =>
      this.exchangeKeysForValues(
        keys,
        metadata,
        moduleKey,
        contextId,
        inquirerId,
        contextFactory,
      );

    const paramsMetadata = getParamsMetadata(moduleKey);
    const isResponseHandled = this.isResponseHandled(
      instance,
      methodName,
      paramsMetadata,
    );

    const httpRedirectResponse = this.reflectRedirect(callback);
    const fnHandleResponse = this.createHandleResponseFn(
      callback,
      isResponseHandled,
      httpRedirectResponse,
    );

    const httpCode = this.reflectHttpStatusCode(callback);
    const httpStatusCode = httpCode
      ? httpCode
      : this.responseController.getStatusByMethod(requestMethod);

    const responseHeaders = this.reflectResponseHeaders(callback);
    const hasCustomHeaders = !isEmpty(responseHeaders);
    const handlerMetadata: HandlerMetadata = {
      argsLength,
      fnHandleResponse,
      paramtypes,
      getParamsMetadata,
      httpStatusCode,
      hasCustomHeaders,
      responseHeaders,
    };
    this.handlerMetadataStorage.set(instance, methodName, handlerMetadata);
    return handlerMetadata;
  }

  /** 读取 @Redirect 装饰器写入的重定向响应元数据。 */
  public reflectRedirect(
    callback: (...args: unknown[]) => unknown,
  ): RedirectResponse {
    return Reflect.getMetadata(REDIRECT_METADATA, callback);
  }

  /** 读取 @HttpCode 装饰器写入的自定义状态码元数据。 */
  public reflectHttpStatusCode(
    callback: (...args: unknown[]) => unknown,
  ): number {
    return Reflect.getMetadata(HTTP_CODE_METADATA, callback);
  }

  /** 读取 @Render 装饰器写入的模板名元数据（服务端渲染）。 */
  public reflectRenderTemplate(
    callback: (...args: unknown[]) => unknown,
  ): string {
    return Reflect.getMetadata(RENDER_METADATA, callback);
  }

  /** 读取 @Header 装饰器写入的自定义响应头元数据。 */
  public reflectResponseHeaders(
    callback: (...args: unknown[]) => unknown,
  ): CustomHeader[] {
    return Reflect.getMetadata(HEADERS_METADATA, callback) || [];
  }

  /** 读取 @Sse 装饰器写入的服务器发送事件（SSE）元数据。 */
  public reflectSse(callback: (...args: unknown[]) => unknown): string {
    return Reflect.getMetadata(SSE_METADATA, callback);
  }

  /**
   * 把参数元数据键（字符串形式的索引 + 类型）交换为 ParamProperties 数组。
   *
   * 对每个参数：
   * 1. 解析出参数位置索引、装饰器数据、绑定的管道；
   * 2. 自定义参数装饰器（CUSTOM_ROUTE_ARGS_METADATA）使用用户提供的工厂函数提取值；
   * 3. 内置装饰器则委托 RouteParamsFactory#exchangeKeyForValue 从请求中提取值。
   *
   * @param keys - 参数元数据的键列表。
   * @param metadata - 参数元数据表（键 -> 参数描述）。
   * @param moduleContext - 所属模块 key（管道创建需要）。
   * @param contextId - 上下文 ID。
   * @param inquirerId - 请求发起者 ID。
   * @param contextFactory - 执行上下文工厂（自定义工厂函数需要）。
   * @returns 每个参数对应的 ParamProperties 数组。
   */
  public exchangeKeysForValues(
    keys: string[],
    metadata: Record<number, RouteParamMetadata>,
    moduleContext: string,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
    contextFactory?: (args: unknown[]) => ExecutionContextHost,
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
        const { factory } = metadata[key];
        const customExtractValue = this.contextUtils.getCustomFactory(
          factory,
          data,
          contextFactory!,
        );
        return { index, extractValue: customExtractValue, type, data, pipes };
      }
      const numericType = Number(type);
      const extractValue = <TRequest, TResponse>(
        req: TRequest,
        res: TResponse,
        next: Function,
      ) =>
        this.paramsFactory.exchangeKeyForValue(numericType, data, {
          req: req as Record<string, any>,
          res,
          next,
        });
      return { index, extractValue, type: numericType, data, pipes };
    });
  }

  /**
   * 对提取出的参数值应用管道（转换/校验）；无管道时原样返回。
   *
   * @param value - 从请求中提取的原始参数值。
   * @param metatype - 参数的元类型（由 mergeParamsMetatypes 合并而来）。
   * @param type - 参数来源类型。
   * @param data - 装饰器数据。
   * @param pipes - 需要应用的管道列表。
   * @returns 经管道处理后的参数值。
   */
  public async getParamValue<T>(
    value: T,
    {
      metatype,
      type,
      data,
    }: { metatype: unknown; type: RouteParamtypes; data: unknown },
    pipes: PipeTransform[],
  ): Promise<unknown> {
    if (!isEmpty(pipes)) {
      return this.pipesConsumer.apply(
        value,
        { metatype, type, data } as any,
        pipes,
      );
    }
    return value;
  }

  /**
   * 判断该参数类型是否可以（且需要）应用管道。
   *
   * 仅"数据类"参数（body、raw body、query、path 参数、上传文件，以及
   * 自定义字符串 key）可以经过管道转换；req/res/next 等对象类参数不行。
   *
   * @param type - 参数来源类型。
   * @returns 可应用管道时返回 true。
   */
  public isPipeable(type: number | string): boolean {
    return (
      type === RouteParamtypes.BODY ||
      type === RouteParamtypes.RAW_BODY ||
      type === RouteParamtypes.QUERY ||
      type === RouteParamtypes.PARAM ||
      type === RouteParamtypes.FILE ||
      type === RouteParamtypes.FILES ||
      isString(type)
    );
  }

  /**
   * 创建守卫执行函数：依次激活守卫链，任一守卫返回 false 时抛出
   * ForbiddenException（403），由异常过滤器转换为响应。
   *
   * @param guards - 收集到的守卫实例列表。
   * @param instance - 控制器实例。
   * @param callback - 控制器方法。
   * @param contextType - 上下文类型。
   * @returns 守卫执行函数；未绑定任何守卫时返回 null。
   */
  public createGuardsFn<TContext extends string = ContextType>(
    guards: CanActivate[],
    instance: Controller,
    callback: (...args: any[]) => any,
    contextType?: TContext,
  ): ((args: any[]) => Promise<void>) | null {
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
   * 创建管道执行函数：对每个参数并行地"提取值 -> 应用管道 -> 写入 args 数组"。
   *
   * @param pipes - 全局/控制器/方法级别的公共管道。
   * @param paramsOptions - 各参数的元数据（含提取函数与参数级管道）。
   * @returns 管道执行函数；无参数需要处理时返回 null。
   */
  public createPipesFn(
    pipes: PipeTransform[],
    paramsOptions: (ParamProperties & { metatype?: any })[],
  ) {
    const pipesFn = async <TRequest, TResponse>(
      args: any[],
      req: TRequest,
      res: TResponse,
      next: Function,
    ) => {
      const resolveParamValue = async (
        param: ParamProperties & { metatype?: any },
      ) => {
        const {
          index,
          extractValue,
          type,
          data,
          metatype,
          pipes: paramPipes,
        } = param;
        const value = extractValue(req, res, next);

        args[index] = this.isPipeable(type)
          ? await this.getParamValue(
              value,
              { metatype, type, data } as any,
              pipes.concat(paramPipes),
            )
          : value;
      };
      await Promise.all(paramsOptions.map(resolveParamValue));
    };
    return paramsOptions.length ? pipesFn : null;
  }

  /**
   * 创建响应处理函数：根据方法上的元数据决定如何把返回值写回响应。
   *
   * 优先级：@Render 模板渲染 -> @Redirect 重定向 -> @Sse 事件流 ->
   * 普通响应（transformToResult 展开值，若未使用 @Res 自己处理响应则写入响应体）。
   *
   * @param callback - 控制器方法。
   * @param isResponseHandled - 是否由用户通过 @Res/@Next 自行处理响应。
   * @param redirectResponse - @Redirect 元数据（可选）。
   * @param httpStatusCode - 自定义状态码（可选）。
   * @returns 响应处理函数 (result, res, req) => Promise。
   */
  public createHandleResponseFn(
    callback: (...args: unknown[]) => unknown,
    isResponseHandled: boolean,
    redirectResponse?: RedirectResponse,
    httpStatusCode?: number,
  ): HandleResponseFn {
    const renderTemplate = this.reflectRenderTemplate(callback);
    if (renderTemplate) {
      return async <TResult, TResponse>(result: TResult, res: TResponse) => {
        return await this.responseController.render(
          result,
          res,
          renderTemplate,
        );
      };
    }
    if (redirectResponse && isString(redirectResponse.url)) {
      return async <TResult, TResponse>(result: TResult, res: TResponse) => {
        await this.responseController.redirect(result, res, redirectResponse);
      };
    }
    const isSseHandler = !!this.reflectSse(callback);
    if (isSseHandler) {
      return async <
        TResult extends Observable<unknown> = any,
        TResponse extends HeaderStream = any,
        TRequest extends IncomingMessage = any,
      >(
        result: TResult,
        res: TResponse,
        req: TRequest,
      ) => {
        const rawResponse = (res as { raw?: TResponse }).raw ?? res;
        await this.responseController.sse(
          result,
          rawResponse,
          (req as any).raw || req,
          {
            additionalHeaders: res.getHeaders?.(),
            statusCode:
              (res as { statusCode?: number }).statusCode ??
              (rawResponse as { statusCode?: number }).statusCode,
          },
        );
      };
    }
    return async <TResult, TResponse>(result: TResult, res: TResponse) => {
      result = await this.responseController.transformToResult(result);
      !isResponseHandled &&
        (await this.responseController.apply(result, res, httpStatusCode));
      return res;
    };
  }

  /**
   * 判断响应是否由用户自行处理（方法签名中注入了 @Res 或 @Next，
   * 且未开启 @Passthrough），此时框架不再代写响应。
   *
   * @param instance - 控制器实例。
   * @param methodName - 方法名。
   * @param paramsMetadata - 参数元数据。
   * @returns 用户自行处理响应时返回 true。
   */
  private isResponseHandled(
    instance: Controller,
    methodName: string,
    paramsMetadata: ParamProperties[],
  ): boolean {
    const hasResponseOrNextDecorator = paramsMetadata.some(
      ({ type }) =>
        type === RouteParamtypes.RESPONSE || type === RouteParamtypes.NEXT,
    );
    const isPassthroughEnabled = this.contextUtils.reflectPassthrough(
      instance,
      methodName,
    );
    return hasResponseOrNextDecorator && !isPassthroughEnabled;
  }
}
