import { HttpServer } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, VersioningType } from '@nestjs/common/enums';
import { InternalServerErrorException } from '@nestjs/common/exceptions';
import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { Type } from '@nestjs/common/interfaces/type.interface';
import { VersionValue } from '@nestjs/common/interfaces/version-options.interface';
import { Logger } from '@nestjs/common/services/logger.service';
import {
  addLeadingSlash,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { pathToRegexp } from 'path-to-regexp';
import { ApplicationConfig } from '../application-config';
import { UnknownRequestMappingException } from '../errors/exceptions/unknown-request-mapping.exception';
import { GuardsConsumer, GuardsContextCreator } from '../guards';
import { ContextIdFactory } from '../helpers/context-id-factory';
import { ExecutionContextHost } from '../helpers/execution-context-host';
import {
  ROUTE_MAPPED_MESSAGE,
  VERSIONED_ROUTE_MAPPED_MESSAGE,
} from '../helpers/messages';
import { RouterMethodFactory } from '../helpers/router-method-factory';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { Injector } from '../injector/injector';
import { ContextId, InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';
import { GraphInspector } from '../inspector/graph-inspector';
import {
  Entrypoint,
  HttpEntrypointMetadata,
} from '../inspector/interfaces/entrypoint.interface';
import {
  InterceptorsConsumer,
  InterceptorsContextCreator,
} from '../interceptors';
import { MetadataScanner } from '../metadata-scanner';
import { PipesConsumer, PipesContextCreator } from '../pipes';
import { ExceptionsFilter } from './interfaces/exceptions-filter.interface';
import { RoutePathMetadata } from './interfaces/route-path-metadata.interface';
import { PathsExplorer } from './paths-explorer';
import { REQUEST_CONTEXT_ID } from './request/request-constants';
import { RouteParamsFactory } from './route-params-factory';
import { RoutePathFactory } from './route-path-factory';
import { RouterExecutionContext } from './router-execution-context';
import { RouterProxy, RouterProxyCallback } from './router-proxy';

/**
 * 路由定义信息（与 PathsExplorer 中的结构一致，此处为 RouterExplorer 内部使用的引用）。
 */
export interface RouteDefinition {
  /** 路由路径数组（已规范化为带前导斜杠）。 */
  path: string[];
  /** HTTP 请求方法（GET、POST 等）。 */
  requestMethod: RequestMethod;
  /** 控制器实例上的原始方法引用。 */
  targetCallback: RouterProxyCallback;
  /** 控制器方法名。 */
  methodName: string;
  /** 方法级版本值（@Version 装饰器写入），未声明时为 undefined。 */
  version?: VersionValue;
}

/**
 * 路由探测器：路由注册流程的核心协调者。
 *
 * 在框架中的角色：NestApplication 初始化时会对容器中的每个控制器调用 explore 方法。
 * 它把多个子组件串联起来：
 * 1. PathsExplorer 扫描控制器方法得到路由定义；
 * 2. RouterExecutionContext 创建"执行上下文"代理（参数提取 -> 守卫 -> 拦截器 -> 管道 -> 调用方法）；
 * 3. RouterProxy 包装异常处理；
 * 4. RoutePathFactory 拼接最终路径；
 * 5. 最后通过 RouterMethodFactory 取得 HTTP 适配器上对应请求方法的注册函数
 *    （如 app.get/app.post），把处理器真正挂载到 Express/Fastify 上。
 */
export class RouterExplorer {
  private readonly executionContextCreator: RouterExecutionContext;
  private readonly pathsExplorer: PathsExplorer;
  private readonly routerMethodFactory = new RouterMethodFactory();
  private readonly logger = new Logger(RouterExplorer.name, {
    timestamp: true,
  });
  private readonly exceptionFiltersCache = new WeakMap();

  /**
   * 组装路由探测所需的所有子组件。
   *
   * 在构造函数中创建参数工厂（RouteParamsFactory）与守卫/拦截器/管道的
   * 上下文创建器和消费者，并把它们交给 RouterExecutionContext 统一管理。
   */
  constructor(
    metadataScanner: MetadataScanner,
    private readonly container: NestContainer,
    private readonly injector: Injector,
    private readonly routerProxy: RouterProxy,
    private readonly exceptionsFilter: ExceptionsFilter,
    config: ApplicationConfig,
    private readonly routePathFactory: RoutePathFactory,
    private readonly graphInspector: GraphInspector,
  ) {
    this.pathsExplorer = new PathsExplorer(metadataScanner);

    // 1. 创建参数工厂，负责把参数装饰器元数据交换为真实参数值
    const routeParamsFactory = new RouteParamsFactory();
    // 2. 创建管道、守卫、拦截器各自的"上下文创建器"（收集实例上绑定的组件）
    //    与"消费者"（实际执行它们）
    const pipesContextCreator = new PipesContextCreator(container, config);
    const pipesConsumer = new PipesConsumer();
    const guardsContextCreator = new GuardsContextCreator(container, config);
    const guardsConsumer = new GuardsConsumer();
    const interceptorsContextCreator = new InterceptorsContextCreator(
      container,
      config,
    );
    const interceptorsConsumer = new InterceptorsConsumer();

    // 3. 汇总为路由执行上下文创建器，后续为每个路由生成"请求处理代理"
    this.executionContextCreator = new RouterExecutionContext(
      routeParamsFactory,
      pipesContextCreator,
      pipesConsumer,
      guardsContextCreator,
      guardsConsumer,
      interceptorsContextCreator,
      interceptorsConsumer,
      container.getHttpAdapterRef(),
    );
  }

  /**
   * 探测指定控制器实例上的所有路由，并把它们注册到 HTTP 适配器。
   *
   * @param instanceWrapper - 控制器的实例包装器（含实例及作用域信息）。
   * @param moduleKey - 控制器所属模块的 key。
   * @param httpAdapterRef - HTTP 适配器（Express/Fastify）。
   * @param host - 控制器级别声明的主机过滤条件（@Controller({ host })）。
   * @param routePathMetadata - 各层级路径/版本元数据。
   */
  public explore<T extends HttpServer = any>(
    instanceWrapper: InstanceWrapper,
    moduleKey: string,
    httpAdapterRef: T,
    host: string | RegExp | Array<string | RegExp>,
    routePathMetadata: RoutePathMetadata,
  ) {
    const { instance } = instanceWrapper;
    const routerPaths = this.pathsExplorer.scanForPaths(instance);
    this.applyPathsToRouterProxy(
      httpAdapterRef,
      routerPaths,
      instanceWrapper,
      moduleKey,
      routePathMetadata,
      host,
    );
  }

  /**
   * 提取控制器类上由 @Controller('path') 声明的路径元数据。
   *
   * @param metatype - 控制器类。
   * @returns 规范化后的路径数组（带前导斜杠）；未声明路径元数据时抛出
   *          UnknownRequestMappingException。
   */
  public extractRouterPath(metatype: Type<Controller>): string[] {
    const path = Reflect.getMetadata(PATH_METADATA, metatype);

    if (isUndefined(path)) {
      throw new UnknownRequestMappingException(metatype);
    }
    if (Array.isArray(path)) {
      return path.map(p => addLeadingSlash(p));
    }
    return [addLeadingSlash(path)];
  }

  /**
   * 遍历所有路由定义，逐条把处理器代理注册到路由器（HTTP 适配器）上。
   *
   * @param router - HTTP 适配器。
   * @param routeDefinitions - PathsExplorer 扫描出的路由定义列表。
   * @param instanceWrapper - 控制器实例包装器。
   * @param moduleKey - 所属模块 key。
   * @param routePathMetadata - 路径/版本元数据（方法版本会逐条更新）。
   * @param host - 主机过滤条件。
   */
  public applyPathsToRouterProxy<T extends HttpServer>(
    router: T,
    routeDefinitions: RouteDefinition[],
    instanceWrapper: InstanceWrapper,
    moduleKey: string,
    routePathMetadata: RoutePathMetadata,
    host: string | RegExp | Array<string | RegExp>,
  ) {
    (routeDefinitions || []).forEach(routeDefinition => {
      const { version: methodVersion } = routeDefinition;
      routePathMetadata.methodVersion = methodVersion;

      this.applyCallbackToRouter(
        router,
        routeDefinition,
        instanceWrapper,
        moduleKey,
        routePathMetadata,
        host,
      );
    });
  }

  /**
   * 把单条路由定义的处理代理注册到 HTTP 适配器（核心注册流程）。
   *
   * @param router - HTTP 适配器。
   * @param routeDefinition - 单条路由定义（路径、请求方法、处理器等）。
   * @param instanceWrapper - 控制器实例包装器。
   * @param moduleKey - 所属模块 key。
   * @param routePathMetadata - 路径/版本元数据。
   * @param host - 主机过滤条件。
   */
  private applyCallbackToRouter<T extends HttpServer>(
    router: T,
    routeDefinition: RouteDefinition,
    instanceWrapper: InstanceWrapper,
    moduleKey: string,
    routePathMetadata: RoutePathMetadata,
    host: string | RegExp | Array<string | RegExp>,
  ) {
    const {
      path: paths,
      requestMethod,
      targetCallback,
      methodName,
    } = routeDefinition;

    const { instance } = instanceWrapper;
    // 1. 根据 HTTP 请求方法取得适配器上对应的注册函数（如 router.get/router.post）
    const routerMethodRef = this.routerMethodFactory
      .get(router, requestMethod)
      .bind(router);

    // 2. 根据控制器作用域决定代理类型：请求作用域需每次请求动态解析实例，
    //    静态作用域则在启动时一次性构建执行上下文代理
    const isRequestScoped = !instanceWrapper.isDependencyTreeStatic();
    const proxy = isRequestScoped
      ? this.createRequestScopedHandler(
          instanceWrapper,
          requestMethod,
          this.container.getModuleByKey(moduleKey)!,
          moduleKey,
          methodName,
        )
      : this.createCallbackProxy(
          instance,
          targetCallback,
          methodName,
          moduleKey,
          requestMethod,
        );

    const isVersioned =
      (routePathMetadata.methodVersion ||
        routePathMetadata.controllerVersion) &&
      routePathMetadata.versioningOptions;
    // 3. 先应用主机过滤器（若控制器声明了 host）
    let routeHandler = this.applyHostFilter(host, proxy);

    paths.forEach(path => {
      // 4. 非 URI 版本控制（Header/Media Type/自定义）通过"版本过滤器"在运行时校验版本
      if (
        isVersioned &&
        routePathMetadata.versioningOptions!.type !== VersioningType.URI
      ) {
        // All versioning (except for URI Versioning) is done via the "Version Filter"
        routeHandler = this.applyVersionFilter(
          router,
          routePathMetadata,
          routeHandler,
        );
      }

      // 5. 用路径工厂计算最终注册路径（全局前缀 + 模块路径 + 控制器/方法路径 + 版本）
      routePathMetadata.methodPath = path;
      const pathsToRegister = this.routePathFactory.create(
        routePathMetadata,
        requestMethod,
      );
      pathsToRegister.forEach(path => {
        // 6. 构建入口点（entrypoint）描述，供 GraphInspector 记录到依赖图
        const entrypointDefinition: Entrypoint<HttpEntrypointMetadata> = {
          type: 'http-endpoint',
          methodName,
          className: instanceWrapper.name,
          classNodeId: instanceWrapper.id,
          metadata: {
            key: path,
            path,
            requestMethod: RequestMethod[
              requestMethod
            ] as keyof typeof RequestMethod,
            methodVersion: routePathMetadata.methodVersion,
            controllerVersion: routePathMetadata.controllerVersion,
          },
        };

        // 7. 把原始方法上的元数据复制到最终处理器（部分适配器会读取这些元数据）
        this.copyMetadataToCallback(targetCallback, routeHandler);
        const normalizedPath = router.normalizePath
          ? router.normalizePath(path)
          : path;

        // 8. 真正把处理器注册到 HTTP 适配器；若适配器支持路由触发回调则包一层通知逻辑
        const httpAdapter = this.container.getHttpAdapterRef();
        const onRouteTriggered = httpAdapter.getOnRouteTriggered?.();
        if (onRouteTriggered) {
          routerMethodRef(normalizedPath, (...args: unknown[]) => {
            onRouteTriggered(requestMethod, path);
            return routeHandler(...args);
          });
        } else {
          routerMethodRef(normalizedPath, routeHandler);
        }

        // 9. 将入口点定义插入依赖图，供外部工具（如资源浏览器）检查
        this.graphInspector.insertEntrypointDefinition<HttpEntrypointMetadata>(
          entrypointDefinition,
          instanceWrapper.id,
        );
      });

      // 10. 生成用于日志输出的路径（不含 URI 版本前缀），打印 "路由已映射" 日志
      const pathsToLog = this.routePathFactory.create(
        {
          ...routePathMetadata,
          versioningOptions: undefined,
        },
        requestMethod,
      );
      pathsToLog.forEach(path => {
        if (isVersioned) {
          const version = this.routePathFactory.getVersion(routePathMetadata);
          this.logger.log(
            VERSIONED_ROUTE_MAPPED_MESSAGE(path, requestMethod, version!),
          );
        } else {
          this.logger.log(ROUTE_MAPPED_MESSAGE(path, requestMethod));
        }
      });
    });
  }

  /**
   * 为处理器包裹"主机过滤器"：只有请求主机名匹配 @Controller({ host }) 声明的
   * 模式时才执行真正的处理器；支持在 host 中使用参数（如 ':sub.example.com'），
   * 匹配到的分组值会写入 req.hosts 供 @HostParam 提取。
   *
   * @param host - 主机过滤条件（字符串、正则或其数组）。
   * @param handler - 原始处理函数。
   * @returns 包裹后的处理函数；未声明 host 时原样返回 handler。
   */
  private applyHostFilter(
    host: string | RegExp | Array<string | RegExp>,
    handler: Function,
  ) {
    if (!host) {
      return handler;
    }

    const httpAdapterRef = this.container.getHttpAdapterRef();
    const hosts = Array.isArray(host) ? host : [host];
    const hostRegExps = hosts.map((host: string | RegExp) => {
      if (typeof host === 'string') {
        try {
          return pathToRegexp(host);
        } catch (e) {
          if (e instanceof TypeError) {
            this.logger.error(
              `Unsupported host "${host}" syntax. In past releases, ?, *, and + were used to denote optional or repeating path parameters. The latest version of "path-to-regexp" now requires the use of named parameters. For example, instead of using a route like /users/* to capture all routes starting with "/users", you should use /users/*path. Please see the migration guide for more information.`,
            );
          }
          throw e;
        }
      }
      return { regexp: host, keys: [] };
    });

    const unsupportedFilteringErrorMessage = Array.isArray(host)
      ? `HTTP adapter does not support filtering on hosts: ["${host.join(
          '", "',
        )}"]`
      : `HTTP adapter does not support filtering on host: "${host}"`;

    return <TRequest extends Record<string, any> = any, TResponse = any>(
      req: TRequest,
      res: TResponse,
      next: () => void,
    ) => {
      (req as Record<string, any>).hosts = {};
      const hostname = httpAdapterRef.getRequestHostname(req) || '';

      for (const exp of hostRegExps) {
        const match = hostname.match(exp.regexp);
        if (match) {
          if (exp.keys.length > 0) {
            exp.keys.forEach((key, i) => (req.hosts[key.name] = match[i + 1]));
          } else if (exp.regexp && match.groups) {
            for (const groupName in match.groups) {
              req.hosts[groupName] = match.groups[groupName];
            }
          }
          return handler(req, res, next);
        }
      }
      if (!next) {
        throw new InternalServerErrorException(
          unsupportedFilteringErrorMessage,
        );
      }
      return next();
    };
  }

  /**
   * 为处理器包裹"版本过滤器"：把版本校验逻辑委托给 HTTP 适配器
   * （applyVersionFilter），运行时按 Header/Media Type 等方式校验请求版本。
   *
   * @param router - HTTP 适配器。
   * @param routePathMetadata - 路径/版本元数据。
   * @param handler - 原始处理函数。
   * @returns 适配器返回的、带版本校验的处理函数。
   */
  private applyVersionFilter<T extends HttpServer>(
    router: T,
    routePathMetadata: RoutePathMetadata,
    handler: Function,
  ) {
    const version = this.routePathFactory.getVersion(routePathMetadata)!;
    return router.applyVersionFilter(
      handler,
      version,
      routePathMetadata.versioningOptions!,
    );
  }

  /**
   * 创建"静态作用域"路由处理代理：启动时一次性构建执行上下文
   * （参数提取 + 守卫 + 拦截器 + 管道 + 方法调用）与异常过滤器链，
   * 再用 RouterProxy 包装成最终的请求处理函数。
   *
   * @param instance - 控制器实例。
   * @param callback - 控制器方法引用。
   * @param methodName - 方法名。
   * @param moduleRef - 所属模块 key。
   * @param requestMethod - HTTP 请求方法。
   * @param contextId - 上下文 ID（默认静态上下文）。
   * @param inquirerId - 请求发起者 ID（用于请求作用域查找）。
   * @returns 包装后的请求处理函数。
   */
  private createCallbackProxy(
    instance: Controller,
    callback: RouterProxyCallback,
    methodName: string,
    moduleRef: string,
    requestMethod: RequestMethod,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ) {
    const executionContext = this.executionContextCreator.create(
      instance,
      callback,
      methodName,
      moduleRef,
      requestMethod,
      contextId,
      inquirerId,
    );
    const exceptionFilter = this.exceptionsFilter.create(
      instance,
      callback,
      moduleRef,
      contextId,
      inquirerId,
    );
    return this.routerProxy.createProxy(executionContext, exceptionFilter);
  }

  /**
   * 创建"请求作用域"路由处理代理：每次请求到来时才从容器中按 ContextId
   * 加载该请求专属的控制器实例，再动态构建回调代理执行；加载失败时
   * 交由（带缓存的）异常过滤器链处理。
   *
   * @param instanceWrapper - 控制器实例包装器。
   * @param requestMethod - HTTP 请求方法。
   * @param moduleRef - 所属模块实例。
   * @param moduleKey - 所属模块 key。
   * @param methodName - 控制器方法名。
   * @returns 每次请求动态解析依赖的异步处理函数。
   */
  public createRequestScopedHandler(
    instanceWrapper: InstanceWrapper,
    requestMethod: RequestMethod,
    moduleRef: Module,
    moduleKey: string,
    methodName: string,
  ) {
    const { instance } = instanceWrapper;
    const collection = moduleRef.controllers;

    const isTreeDurable = instanceWrapper.isDependencyTreeDurable();

    return async <TRequest extends Record<any, any>, TResponse>(
      req: TRequest,
      res: TResponse,
      next: () => void,
    ) => {
      try {
        const contextId = this.getContextId(req, isTreeDurable);
        const contextInstance = await this.injector.loadPerContext(
          instance,
          moduleRef,
          collection,
          contextId,
        );
        await this.createCallbackProxy(
          contextInstance,
          contextInstance[methodName],
          methodName,
          moduleKey,
          requestMethod,
          contextId,
          instanceWrapper.id,
        )(req, res, next);
      } catch (err) {
        let exceptionFilter = this.exceptionFiltersCache.get(
          instance[methodName],
        );
        if (!exceptionFilter) {
          exceptionFilter = this.exceptionsFilter.create(
            instance,
            instance[methodName],
            moduleKey,
          );
          this.exceptionFiltersCache.set(instance[methodName], exceptionFilter);
        }
        const host = new ExecutionContextHost([req, res, next]);
        exceptionFilter.next(err, host);
      }
    };
  }

  /**
   * 获取（并首次时缓存）当前请求的上下文 ID。
   *
   * 首次遇到该请求时：把 ContextId 以不可枚举属性挂到请求对象上，
   * 并向容器注册该请求的 REQUEST 提供者值（持久化/ durable 模式下只挂 payload）。
   *
   * @param request - HTTP 请求对象。
   * @param isTreeDurable - 依赖树是否为 durable（持久请求作用域）模式。
   * @returns 当前请求的上下文 ID。
   */
  private getContextId<T extends Record<any, unknown> = any>(
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
   * 把原始控制器方法上的所有元数据键复制到最终注册的处理函数上，
   * 保证运行时（如某些适配器或第三方库）能从处理器上读到装饰器元数据。
   *
   * @param originalCallback - 原始控制器方法。
   * @param targetCallback - 最终注册到适配器的处理函数。
   */
  private copyMetadataToCallback(
    originalCallback: RouterProxyCallback,
    targetCallback: Function,
  ) {
    for (const key of Reflect.getMetadataKeys(originalCallback)) {
      Reflect.defineMetadata(
        key,
        Reflect.getMetadata(key, originalCallback),
        targetCallback,
      );
    }
  }
}
