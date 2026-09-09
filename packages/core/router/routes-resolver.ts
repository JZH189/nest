import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  HOST_METADATA,
  MODULE_PATH,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import {
  Controller,
  HttpServer,
  Type,
  VersionValue,
} from '@nestjs/common/interfaces';
import { Logger } from '@nestjs/common/services/logger.service';
import { ApplicationConfig } from '../application-config';
import {
  CONTROLLER_MAPPING_MESSAGE,
  VERSIONED_CONTROLLER_MAPPING_MESSAGE,
} from '../helpers/messages';
import { NestContainer } from '../injector/container';
import { Injector } from '../injector/injector';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { GraphInspector } from '../inspector/graph-inspector';
import { MetadataScanner } from '../metadata-scanner';
import { Resolver } from './interfaces/resolver.interface';
import { RoutePathMetadata } from './interfaces/route-path-metadata.interface';
import { RoutePathFactory } from './route-path-factory';
import { RouterExceptionFilters } from './router-exception-filters';
import { RouterExplorer } from './router-explorer';
import { RouterProxy } from './router-proxy';

/**
 * 路由解析器：应用启动时把所有控制器的路由注册到 HTTP 适配器的总入口。
 *
 * 在框架中的角色：NestApplication#init 会依次调用 registerExceptionHandler、
 * registerNotFoundHandler 与 resolve。resolve 遍历容器中的所有模块与控制器，
 * 委托 RouterExplorer 扫描方法并注册；同时负责 404 兜底处理器与
 * 外部异常（适配器层抛出的错误）兜底处理器的注册。
 */
export class RoutesResolver implements Resolver {
  private readonly logger = new Logger(RoutesResolver.name, {
    timestamp: true,
  });
  private readonly routerProxy = new RouterProxy();
  private readonly routePathFactory: RoutePathFactory;
  private readonly routerExceptionsFilter: RouterExceptionFilters;
  private readonly routerExplorer: RouterExplorer;

  constructor(
    private readonly container: NestContainer,
    private readonly applicationConfig: ApplicationConfig,
    private readonly injector: Injector,
    graphInspector: GraphInspector,
  ) {
    const httpAdapterRef = container.getHttpAdapterRef();
    this.routerExceptionsFilter = new RouterExceptionFilters(
      container,
      applicationConfig,
      httpAdapterRef,
    );
    this.routePathFactory = new RoutePathFactory(this.applicationConfig);

    const metadataScanner = new MetadataScanner();
    this.routerExplorer = new RouterExplorer(
      metadataScanner,
      this.container,
      this.injector,
      this.routerProxy,
      this.routerExceptionsFilter,
      this.applicationConfig,
      this.routePathFactory,
      graphInspector,
    );
  }

  /**
   * 解析并注册容器中所有模块下的所有控制器路由。
   *
   * @param applicationRef - HTTP 适配器。
   * @param globalPrefix - 通过 setGlobalPrefix 设置的全局路由前缀。
   */
  public resolve<T extends HttpServer>(
    applicationRef: T,
    globalPrefix: string,
  ) {
    // 1. 遍历容器中所有模块
    const modules = this.container.getModules();
    modules.forEach(({ controllers, metatype }, moduleName) => {
      // 2. 读取模块路径元数据（RouterModule 注册的 MODULE_PATH）
      const modulePath = this.getModulePathMetadata(metatype)!;
      // 3. 为该模块下的所有控制器注册路由
      this.registerRouters(
        controllers,
        moduleName,
        globalPrefix,
        modulePath,
        applicationRef,
      );
    });
  }

  /**
   * 注册指定模块下所有控制器的路由。
   *
   * @param routes - 模块内控制器实例表（key -> InstanceWrapper）。
   * @param moduleName - 模块名。
   * @param globalPrefix - 全局路由前缀。
   * @param modulePath - 模块路径前缀。
   * @param applicationRef - HTTP 适配器。
   */
  public registerRouters(
    routes: Map<string | symbol | Function, InstanceWrapper<Controller>>,
    moduleName: string,
    globalPrefix: string,
    modulePath: string,
    applicationRef: HttpServer,
  ) {
    routes.forEach(instanceWrapper => {
      const { metatype } = instanceWrapper;

      // 1. 读取控制器级元数据：主机过滤、路径、版本
      const host = this.getHostMetadata(metatype!);
      const routerPaths = this.routerExplorer.extractRouterPath(
        metatype as Type<any>,
      );
      const controllerVersion = this.getVersionMetadata(metatype!);
      const controllerName = metatype!.name;

      routerPaths.forEach(path => {
        // 2. 计算用于日志展示的控制器路径并打印"控制器已映射"日志
        const pathsToLog = this.routePathFactory.create({
          ctrlPath: path,
          modulePath,
          globalPrefix,
        });
        if (!controllerVersion) {
          pathsToLog.forEach(path => {
            const logMessage = CONTROLLER_MAPPING_MESSAGE(controllerName, path);
            this.logger.log(logMessage);
          });
        } else {
          pathsToLog.forEach(path => {
            const logMessage = VERSIONED_CONTROLLER_MAPPING_MESSAGE(
              controllerName,
              path,
              controllerVersion,
            );
            this.logger.log(logMessage);
          });
        }

        // 3. 组装控制器级路径元数据，交给 RouterExplorer 扫描并注册所有方法路由
        const versioningOptions = this.applicationConfig.getVersioning();
        const routePathMetadata: RoutePathMetadata = {
          ctrlPath: path,
          modulePath,
          globalPrefix,
          controllerVersion,
          versioningOptions,
        };
        this.routerExplorer.explore(
          instanceWrapper,
          moduleName,
          applicationRef,
          host!,
          routePathMetadata,
        );
      });
    });
  }

  /**
   * 注册 404 兜底处理器：请求未命中任何路由时抛出 NotFoundException
   * （"Cannot GET /url"），并交由异常过滤器链转换为响应。
   */
  public registerNotFoundHandler() {
    const applicationRef = this.container.getHttpAdapterRef();
    const callback = <TRequest, TResponse>(req: TRequest, res: TResponse) => {
      const method = applicationRef.getRequestMethod(req);
      const url = applicationRef.getRequestUrl(req);
      throw new NotFoundException(`Cannot ${method} ${url}`);
    };
    const handler = this.routerExceptionsFilter.create({}, callback, undefined);
    const proxy = this.routerProxy.createProxy(callback, handler);
    applicationRef.setNotFoundHandler &&
      applicationRef.setNotFoundHandler(
        proxy,
        this.applicationConfig.getGlobalPrefix(),
      );
  }

  /**
   * 注册全局错误处理兜底：适配器中间件/错误层抛出的异常先经 mapExternalException
   * 映射为 NestJS 异常，再交由异常层代理与异常过滤器链处理。
   */
  public registerExceptionHandler() {
    const callback = <TError, TRequest, TResponse>(
      err: TError,
      req: TRequest,
      res: TResponse,
      next: Function,
    ) => {
      throw this.mapExternalException(err);
    };
    const handler = this.routerExceptionsFilter.create(
      {},
      callback as any,
      undefined,
    );
    const proxy = this.routerProxy.createExceptionLayerProxy(callback, handler);
    const applicationRef = this.container.getHttpAdapterRef();
    applicationRef.setErrorHandler &&
      applicationRef.setErrorHandler(
        proxy,
        this.applicationConfig.getGlobalPrefix(),
      );
  }

  /**
   * 把适配器层抛出的"外部异常"映射为 NestJS 的 HttpException。
   *
   * @param err - 原始异常。
   * @returns 映射后的异常：JSON 语法错误/URI 编码错误 -> BadRequestException；
   *          Fastify 错误 -> 按其 statusCode 构造 HttpException；其余原样返回。
   */
  public mapExternalException(err: any) {
    switch (true) {
      // SyntaxError is thrown by Express body-parser when given invalid JSON (#422, #430)
      // URIError is thrown by Express when given a path parameter with an invalid percentage
      // encoding, e.g. '%FF' (#8915)
      case err instanceof SyntaxError || err instanceof URIError:
        return new BadRequestException(err.message);
      case this.isHttpFastifyError(err):
        return new HttpException(err.message, err.statusCode);
      default:
        return err;
    }
  }

  /** 判断异常是否为 Fastify 的 FastifyError（带 statusCode 属性的 Error）。 */
  private isHttpFastifyError(
    error: any,
  ): error is Error & { statusCode: number } {
    // condition based on this code - https://github.com/fastify/fastify-error/blob/d669b150a82968322f9f7be992b2f6b463272de3/index.js#L22
    return (
      error.statusCode !== undefined &&
      error instanceof Error &&
      error.name === 'FastifyError'
    );
  }

  /** 读取模块上由 RouterModule 写入的路径元数据（兼容应用级/全局两种 key）。 */
  private getModulePathMetadata(metatype: Type<unknown>): string | undefined {
    const modulesContainer = this.container.getModules();
    const modulePath = Reflect.getMetadata(
      MODULE_PATH + modulesContainer.applicationId,
      metatype,
    );
    return modulePath ?? Reflect.getMetadata(MODULE_PATH, metatype);
  }

  /** 读取控制器上由 @Controller({ host }) 写入的主机过滤元数据。 */
  private getHostMetadata(
    metatype: Type<unknown> | Function,
  ): string | string[] | undefined {
    return Reflect.getMetadata(HOST_METADATA, metatype);
  }

  /** 读取控制器版本元数据（@Controller({ version })），启用版本控制时回退到默认版本。 */
  private getVersionMetadata(
    metatype: Type<unknown> | Function,
  ): VersionValue | undefined {
    const versioningConfig = this.applicationConfig.getVersioning();
    if (versioningConfig) {
      return (
        Reflect.getMetadata(VERSION_METADATA, metatype) ??
        versioningConfig.defaultVersion
      );
    }
  }
}
