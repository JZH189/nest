import { HttpServer, InjectionToken, Logger } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import {
  MiddlewareConfiguration,
  NestMiddleware,
  RouteInfo,
} from '@nestjs/common/interfaces/middleware';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { isUndefined } from '@nestjs/common/utils/shared.utils';
import { ApplicationConfig } from '../application-config';
import { InvalidMiddlewareException } from '../errors/exceptions/invalid-middleware.exception';
import { RuntimeException } from '../errors/exceptions/runtime.exception';
import { ContextIdFactory } from '../helpers/context-id-factory';
import { ExecutionContextHost } from '../helpers/execution-context-host';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { Injector } from '../injector/injector';
import { ContextId, InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';
import { GraphInspector } from '../inspector/graph-inspector';
import {
  Entrypoint,
  MiddlewareEntrypointMetadata,
} from '../inspector/interfaces/entrypoint.interface';
import { REQUEST_CONTEXT_ID } from '../router/request/request-constants';
import { RouterExceptionFilters } from '../router/router-exception-filters';
import { RouterProxy } from '../router/router-proxy';
import { isRequestMethodAll } from '../router/utils';
import { MiddlewareBuilder } from './builder';
import { MiddlewareContainer } from './container';
import { MiddlewareResolver } from './resolver';
import { RouteInfoPathExtractor } from './route-info-path-extractor';
import { RoutesMapper } from './routes-mapper';

/**
 * 中间件模块（MiddlewareModule）：NestJS 中间件机制的顶层编排者。
 *
 * 在框架中的角色：应用初始化时由 NestApplication 调用，依次完成——
 * 1) 遍历所有模块并调用其 configure(MiddlewareBuilder) 收集中间件配置；
 * 2) 解析中间件实例（含请求作用域）；
 * 3) 将中间件按"路由 -> 中间件"的映射注册到底层 HTTP 适配器，
 *    并为请求作用域中间件注入上下文与异常过滤器。
 */
export class MiddlewareModule<
  TAppOptions extends NestApplicationContextOptions =
    NestApplicationContextOptions,
> {
  /** 路由代理，用于把中间件方法包装成带异常处理的代理函数。 */
  private readonly routerProxy = new RouterProxy();
  /** 异常过滤器缓存（按中间件方法弱引用），避免重复创建。 */
  private readonly exceptionFiltersCache = new WeakMap();
  private readonly logger = new Logger(MiddlewareModule.name);

  private injector: Injector;
  private routerExceptionFilter: RouterExceptionFilters;
  private routesMapper: RoutesMapper;
  private resolver: MiddlewareResolver;
  private container: NestContainer;
  private httpAdapter: HttpServer;
  private graphInspector: GraphInspector;
  private appOptions: TAppOptions;
  private routeInfoPathExtractor: RouteInfoPathExtractor;

  /**
   * 注册中间件模块：初始化各协作组件并解析所有模块中声明的中间件。
   *
   * @param middlewareContainer - 中间件容器，存放中间件配置与实例包装器。
   * @param container - 应用 IoC 容器。
   * @param config - 应用配置（全局前缀、全局中间件等）。
   * @param injector - 注入器，用于加载请求作用域实例。
   * @param httpAdapter - 底层 HTTP 适配器（如 ExpressAdapter）。
   * @param graphInspector - 图检查器，用于记录中间件节点与入口点。
   * @param options - 应用启动选项。
   */
  public async register(
    middlewareContainer: MiddlewareContainer,
    container: NestContainer,
    config: ApplicationConfig,
    injector: Injector,
    httpAdapter: HttpServer,
    graphInspector: GraphInspector,
    options: TAppOptions,
  ) {
    this.appOptions = options;

    const appRef = container.getHttpAdapterRef();
    // 1. 构建异常过滤器、路由映射器、解析器与路径提取器等协作组件
    this.routerExceptionFilter = new RouterExceptionFilters(
      container,
      config,
      appRef,
    );
    this.routesMapper = new RoutesMapper(container, config);
    this.resolver = new MiddlewareResolver(middlewareContainer, injector);
    this.routeInfoPathExtractor = new RouteInfoPathExtractor(config);
    this.injector = injector;
    this.container = container;
    this.httpAdapter = httpAdapter;
    this.graphInspector = graphInspector;

    // 2. 并发处理所有模块：加载其 configure() 配置并解析中间件实例
    const modules = container.getModules();
    await this.resolveMiddleware(middlewareContainer, modules);
  }

  /**
   * 解析所有模块的中间件：并发地为每个模块加载配置并解析中间件实例。
   *
   * @param middlewareContainer - 中间件容器。
   * @param modules - 应用中的全部模块（token -> Module）。
   */
  public async resolveMiddleware(
    middlewareContainer: MiddlewareContainer,
    modules: Map<string, Module>,
  ) {
    const moduleEntries = [...modules.entries()];
    const loadMiddlewareConfiguration = async ([moduleName, moduleRef]: [
      string,
      Module,
    ]) => {
      await this.loadConfiguration(middlewareContainer, moduleRef, moduleName);
      await this.resolver.resolveInstances(moduleRef, moduleName);
    };
    await Promise.all(moduleEntries.map(loadMiddlewareConfiguration));
  }

  /**
   * 加载某个模块的中间件配置：若模块定义了 configure 方法，
   * 则传入 MiddlewareBuilder 供开发者声明路由与中间件的映射，
   * 并把构建结果写入中间件容器。
   *
   * @param middlewareContainer - 中间件容器。
   * @param moduleRef - 目标模块引用。
   * @param moduleKey - 目标模块 token。
   */
  public async loadConfiguration(
    middlewareContainer: MiddlewareContainer,
    moduleRef: Module,
    moduleKey: string,
  ) {
    const { instance } = moduleRef;
    if (!instance.configure) {
      return;
    }
    // 1. 为该模块创建专属的 MiddlewareBuilder 并调用其 configure 钩子
    const middlewareBuilder = new MiddlewareBuilder(
      this.routesMapper,
      this.httpAdapter,
      this.routeInfoPathExtractor,
    );
    try {
      await instance.configure(middlewareBuilder);
    } catch (err) {
      if (!this.appOptions.preview) {
        throw err;
      }
      const warningMessage =
        `Warning! "${moduleRef.name}" module exposes a "configure" method that throws an exception in the preview mode` +
        ` (possibly due to missing dependencies). Note: you can ignore this message, just be aware that some of those conditional middlewares will not be reflected in your graph.`;
      this.logger.warn(warningMessage);
    }

    if (!(middlewareBuilder instanceof MiddlewareBuilder)) {
      return;
    }
    // 2. 将 builder 收集到的配置登记到中间件容器中
    const config = middlewareBuilder.build();
    middlewareContainer.insertConfig(config, moduleKey);
  }

  /**
   * 把中间件容器中收集到的全部配置注册到 HTTP 适配器。
   * 注册顺序按模块"距离"排序：全局模块（distance 为 MAX_VALUE）最先，
   * 其余按依赖距离从近到远，保证中间件的执行顺序符合模块依赖层次。
   *
   * @param middlewareContainer - 中间件容器。
   * @param applicationRef - 底层 HTTP 适配器实例。
   */
  public async registerMiddleware(
    middlewareContainer: MiddlewareContainer,
    applicationRef: any,
  ) {
    const configs = middlewareContainer.getConfigurations();
    const registerAllConfigs = async (
      moduleKey: string,
      middlewareConfig: MiddlewareConfiguration[],
    ) => {
      for (const config of middlewareConfig) {
        await this.registerMiddlewareConfig(
          middlewareContainer,
          config,
          moduleKey,
          applicationRef,
        );
      }
    };

    const entriesSortedByDistance = [...configs.entries()].sort(
      ([moduleA], [moduleB]) => {
        const moduleARef = this.container.getModuleByKey(moduleA)!;
        const moduleBRef = this.container.getModuleByKey(moduleB)!;
        const isModuleAGlobal = moduleARef.distance === Number.MAX_VALUE;
        const isModuleBGlobal = moduleBRef.distance === Number.MAX_VALUE;
        if (isModuleAGlobal && isModuleBGlobal) {
          return 0;
        }
        if (isModuleAGlobal) {
          return -1;
        }
        if (isModuleBGlobal) {
          return 1;
        }
        return moduleARef.distance - moduleBRef.distance;
      },
    );
    for (const [moduleRef, moduleConfigurations] of entriesSortedByDistance) {
      await registerAllConfigs(moduleRef, [...moduleConfigurations]);
    }
  }

  /**
   * 注册单条中间件配置：遍历其 forRoutes 声明的所有路由信息，
   * 逐一注册路由中间件。
   *
   * @param middlewareContainer - 中间件容器。
   * @param config - 中间件配置（中间件类型 + forRoutes 路由列表）。
   * @param moduleKey - 声明该配置的模块 token。
   * @param applicationRef - 底层 HTTP 适配器实例。
   */
  public async registerMiddlewareConfig(
    middlewareContainer: MiddlewareContainer,
    config: MiddlewareConfiguration,
    moduleKey: string,
    applicationRef: any,
  ) {
    const { forRoutes } = config;
    for (const routeInfo of forRoutes) {
      await this.registerRouteMiddleware(
        middlewareContainer,
        routeInfo as RouteInfo,
        config,
        moduleKey,
        applicationRef,
      );
    }
  }

  /**
   * 为指定路由注册中间件：校验中间件已在容器中解析，
   * 向图检查器登记中间件节点与入口点，最后绑定处理函数。
   *
   * @param middlewareContainer - 中间件容器。
   * @param routeInfo - 目标路由信息（路径、请求方法、版本）。
   * @param config - 中间件配置。
   * @param moduleKey - 所属模块 token。
   * @param applicationRef - 底层 HTTP 适配器实例。
   */
  public async registerRouteMiddleware(
    middlewareContainer: MiddlewareContainer,
    routeInfo: RouteInfo,
    config: MiddlewareConfiguration,
    moduleKey: string,
    applicationRef: any,
  ) {
    const middlewareCollection = [].concat(config.middleware);
    const moduleRef = this.container.getModuleByKey(moduleKey)!;

    for (const metatype of middlewareCollection) {
      // 1. 校验中间件实例包装器已存在于容器的中间件集合中
      const collection = middlewareContainer.getMiddlewareCollection(moduleKey);
      const instanceWrapper = collection.get(metatype);

      if (isUndefined(instanceWrapper)) {
        throw new RuntimeException();
      }
      if (instanceWrapper.isTransient) {
        return;
      }

      // 2. 向依赖图登记中间件类节点与"middleware"入口点（use 方法）
      this.graphInspector.insertClassNode(
        moduleRef,
        instanceWrapper,
        'middleware',
      );
      const middlewareDefinition: Entrypoint<MiddlewareEntrypointMetadata> = {
        type: 'middleware',
        methodName: 'use',
        className: instanceWrapper.name,
        classNodeId: instanceWrapper.id,
        metadata: {
          key: routeInfo.path,
          path: routeInfo.path,
          requestMethod:
            (RequestMethod[routeInfo.method] as keyof typeof RequestMethod) ??
            'ALL',
          version: routeInfo.version,
        },
      };
      this.graphInspector.insertEntrypointDefinition(
        middlewareDefinition,
        instanceWrapper.id,
      );

      // 3. 将中间件处理函数绑定到底层 HTTP 适配器
      await this.bindHandler(
        instanceWrapper,
        applicationRef,
        routeInfo,
        moduleRef,
        collection,
      );
    }
  }

  /**
   * 绑定中间件处理函数：静态（请求无关）中间件直接创建代理注册；
   * 请求作用域中间件则注册一个包装函数，在每次请求时按上下文 id
   * 动态加载实例并执行，异常交给路由异常过滤器处理。
   *
   * @param wrapper - 中间件实例包装器。
   * @param applicationRef - 底层 HTTP 适配器。
   * @param routeInfo - 目标路由信息。
   * @param moduleRef - 所属模块引用。
   * @param collection - 该模块的中间件实例包装器集合。
   */
  private async bindHandler(
    wrapper: InstanceWrapper<NestMiddleware>,
    applicationRef: HttpServer,
    routeInfo: RouteInfo,
    moduleRef: Module,
    collection: Map<InjectionToken, InstanceWrapper>,
  ) {
    const { instance, metatype } = wrapper;

    if (isUndefined(instance?.use)) {
      throw new InvalidMiddlewareException(metatype!.name);
    }
    // 1. 静态依赖树：直接创建带异常过滤器的代理并注册
    const isStatic = wrapper.isDependencyTreeStatic();
    if (isStatic) {
      const proxy = await this.createProxy(instance);
      return this.registerHandler(applicationRef, routeInfo, proxy);
    }

    // 2. 请求作用域：注册一个"按请求加载实例"的动态包装函数
    const isTreeDurable = wrapper.isDependencyTreeDurable();

    await this.registerHandler(
      applicationRef,
      routeInfo,
      async <TRequest, TResponse>(
        req: TRequest,
        res: TResponse,
        next: () => void,
      ) => {
        try {
          // 2.1 从请求中解析（或创建）上下文 id，并加载该请求专属的中间件实例
          const contextId = this.getContextId(req, isTreeDurable);
          const contextInstance = await this.injector.loadPerContext(
            instance,
            moduleRef,
            collection,
            contextId,
          );
          // 2.2 用请求专属实例创建代理并执行
          const proxy = await this.createProxy<TRequest, TResponse>(
            contextInstance,
            contextId,
          );
          return proxy(req, res, next);
        } catch (err) {
          // 2.3 出错时通过（缓存的）异常过滤器统一处理
          let exceptionsHandler = this.exceptionFiltersCache.get(instance.use);
          if (!exceptionsHandler) {
            exceptionsHandler = this.routerExceptionFilter.create(
              instance,
              instance.use,
              undefined,
            );
            this.exceptionFiltersCache.set(instance.use, exceptionsHandler);
          }
          const host = new ExecutionContextHost([req, res, next]);
          exceptionsHandler.next(err, host);
        }
      },
    );
  }

  /**
   * 创建中间件处理代理：为 use 方法绑定异常过滤器，并通过
   * RouterProxy 生成"先执行异常过滤器、再调用中间件"的代理函数。
   *
   * @param instance - 中间件实例。
   * @param contextId - 请求上下文 id（请求作用域中间件使用）。
   * @returns 可直接注册到路由器的中间件代理函数。
   */
  private async createProxy<TRequest = unknown, TResponse = unknown>(
    instance: NestMiddleware,
    contextId = STATIC_CONTEXT,
  ): Promise<(req: TRequest, res: TResponse, next: () => void) => void> {
    const exceptionsHandler = this.routerExceptionFilter.create(
      instance,
      instance.use,
      undefined,
      contextId,
    );
    const middleware = instance.use.bind(instance);
    return this.routerProxy.createProxy(middleware, exceptionsHandler);
  }

  /**
   * 将中间件代理函数注册到 HTTP 适配器的路由器上：
   * 1. 按路由信息提取需要挂载的全部路径（含全局前缀与版本）；
   * 2. 若请求方法不是 ALL，则包一层方法匹配判断（含 HEAD -> GET 兼容）；
   * 3. 逐路径调用路由器工厂完成挂载。
   *
   * @param applicationRef - 底层 HTTP 适配器。
   * @param routeInfo - 路由信息。
   * @param proxy - 中间件代理函数。
   */
  private async registerHandler(
    applicationRef: HttpServer,
    routeInfo: RouteInfo,
    proxy: <TRequest, TResponse>(
      req: TRequest,
      res: TResponse,
      next: () => void,
    ) => void,
  ) {
    const { method } = routeInfo;
    const paths = this.routeInfoPathExtractor.extractPathsFrom(routeInfo);
    const isMethodAll = isRequestMethodAll(method);
    const requestMethod = RequestMethod[method];
    const router = await applicationRef.createMiddlewareFactory(method);
    const middlewareFunction = isMethodAll
      ? proxy
      : <TRequest, TResponse>(
          req: TRequest,
          res: TResponse,
          next: () => void,
        ) => {
          const actualRequestMethod = applicationRef.getRequestMethod?.(req);
          if (
            actualRequestMethod === requestMethod ||
            (actualRequestMethod === RequestMethod[RequestMethod.HEAD] &&
              requestMethod === RequestMethod[RequestMethod.GET])
          ) {
            return proxy(req, res, next);
          }
          return next();
        };
    const pathsToApplyMiddleware = [] as string[];
    paths.some(path => path.match(/^\/?$/))
      ? pathsToApplyMiddleware.push('/')
      : pathsToApplyMiddleware.push(...paths);
    pathsToApplyMiddleware.forEach(path => router(path, middlewareFunction));
  }

  /**
   * 获取（或创建）当前请求的上下文 id：首次见到该请求时，将上下文 id
   * 以不可枚举属性挂在请求对象上，并按需注册请求提供者（REQUEST）。
   *
   * @param request - 当前请求对象。
   * @param isTreeDurable - 依赖树是否为 DURABLE 作用域。
   * @returns 该请求对应的上下文 id。
   */
  private getContextId(request: unknown, isTreeDurable: boolean): ContextId {
    const contextId = ContextIdFactory.getByRequest(request as object);
    if (!request![REQUEST_CONTEXT_ID]) {
      Object.defineProperty(request, REQUEST_CONTEXT_ID, {
        value: contextId,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      const requestProviderValue = isTreeDurable
        ? contextId.payload
        : Object.assign(request as object, contextId.payload);
      this.container.registerRequestProvider(requestProviderValue, contextId);
    }
    return contextId;
  }
}
