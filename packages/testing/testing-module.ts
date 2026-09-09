import {
  HttpServer,
  INestApplication,
  INestMicroservice,
  Logger,
  NestApplicationOptions,
  Type,
} from '@nestjs/common';
import { NestMicroserviceOptions } from '@nestjs/common/interfaces/microservices/nest-microservice-options.interface';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isUndefined } from '@nestjs/common/utils/shared.utils';
import {
  AbstractHttpAdapter,
  NestApplication,
  NestApplicationContext,
} from '@nestjs/core';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { NestContainer } from '@nestjs/core/injector/container';
import { Module } from '@nestjs/core/injector/module';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';

/**
 * @publicApi
 *
 * 测试模块：TestingModuleBuilder.compile() 的产物，继承自
 * NestApplicationContext（普通应用上下文），是测试与框架之间的桥梁。
 *
 * 典型用法：
 * 1. `module.get(SomeService)` 直接从容器中取出被测实例；
 * 2. `module.createNestApplication()` 创建完整的 HTTP 应用，
 *    再调用 init() 后配合 supertest 做端到端（e2e）测试；
 * 3. `module.createNestMicroservice()` 创建微服务实例做微服务集成测试。
 *
 * 注意：compile() 后模块已经完成依赖实例化，因此 get() 默认即可拿到真实
 * （或被覆盖/mock 后）的实例，无需再显式 init()。
 */
export class TestingModule extends NestApplicationContext {
  protected readonly graphInspector: GraphInspector;

  /**
   * @param container - 编译完成的 IoC 容器。
   * @param graphInspector - 依赖图检查器（用于快照/内省）。
   * @param contextModule - 根测试模块引用。
   * @param applicationConfig - 应用配置。
   * @param scope - 上下文作用域链（按需创建请求作用域实例时使用）。
   */
  constructor(
    container: NestContainer,
    graphInspector: GraphInspector,
    contextModule: Module,
    private readonly applicationConfig: ApplicationConfig,
    scope: Type<any>[] = [],
  ) {
    const options = {};
    super(container, options, contextModule, scope);

    this.graphInspector = graphInspector;
  }

  /**
   * 类型守卫：判断传入参数是 HTTP 服务器/适配器（而非应用选项对象），
   * 通过检测其是否具有 patch 方法来区分。
   *
   * @param serverOrOptions - createNestApplication 的第一个参数。
   * @returns true 表示第一个参数是 HTTP 服务器/适配器。
   */
  private isHttpServer(
    serverOrOptions:
      | HttpServer
      | AbstractHttpAdapter
      | NestApplicationOptions
      | undefined,
  ): serverOrOptions is HttpServer | AbstractHttpAdapter {
    return !!(serverOrOptions && (serverOrOptions as HttpServer).patch);
  }

  /**
   * 基于当前测试模块创建完整的 Nest HTTP 应用实例（e2e 测试入口）。
   *
   * 流程：
   * 1. 区分第一个参数是 httpAdapter 还是应用选项，未传适配器时
   *    默认加载 @nestjs/platform-express 的 ExpressAdapter；
   * 2. 应用日志选项并把适配器注册进容器；
   * 3. 创建 NestApplication 实例；
   * 4. 用 Proxy 包装：访问应用上不存在的属性时回退到 httpAdapter，
   *    使 supertest 等库需要的底层 Express app 方法（如 use/get）
   *    可以直接透传使用。
   *
   * @param httpAdapter - 可选的 HTTP 服务器或适配器（重载一）。
   * @param options - 可选的应用选项（logger、cors 等，重载二）。
   * @returns NestApplication 实例（经适配器代理包装），随后可调用 init()。
   */
  public createNestApplication<T extends INestApplication = INestApplication>(
    httpAdapter: HttpServer | AbstractHttpAdapter,
    options?: NestApplicationOptions,
  ): T;
  /** 重载：不传适配器、仅传应用选项的便捷调用形式 */
  public createNestApplication<T extends INestApplication = INestApplication>(
    options?: NestApplicationOptions,
  ): T;
  public createNestApplication<T extends INestApplication = INestApplication>(
    serverOrOptions:
      | HttpServer
      | AbstractHttpAdapter
      | NestApplicationOptions
      | undefined,
    options?: NestApplicationOptions,
  ): T {
    // 1. 依据参数形态拆分出 httpAdapter 与 appOptions（缺省时创建默认 Express 适配器）
    const [httpAdapter, appOptions] = this.isHttpServer(serverOrOptions)
      ? [serverOrOptions, options]
      : [this.createHttpAdapter(), serverOrOptions];

    // 2. 应用日志选项，并把适配器挂到容器上供路由注册使用
    this.applyLogger(appOptions);
    this.container.setHttpAdapter(httpAdapter);

    // 3. 创建真正的应用实例
    const instance = new NestApplication(
      this.container,
      httpAdapter,
      this.applicationConfig,
      this.graphInspector,
      appOptions,
    );
    // 4. 返回经适配器代理包装后的实例（支持透传 adapter 上的方法）
    return this.createAdapterProxy<T>(instance, httpAdapter);
  }

  /**
   * 基于当前测试模块创建微服务实例（微服务集成测试入口）。
   *
   * @param options - 微服务选项（transport、options 等，同时承载泛型扩展）。
   * @returns 微服务实例（INestMicroservice），随后可调用 listen()/close()。
   */
  public createNestMicroservice<T extends object>(
    options: NestMicroserviceOptions & T,
  ): INestMicroservice {
    const { NestMicroservice } = loadPackage(
      '@nestjs/microservices',
      'TestingModule',
      () => require('@nestjs/microservices'),
    );
    this.applyLogger(options);
    return new NestMicroservice(
      this.container,
      options,
      this.graphInspector,
      this.applicationConfig,
    );
  }

  /** 动态加载 @nestjs/platform-express 并创建默认的 Express 适配器 */
  private createHttpAdapter<T = any>(httpServer?: T): AbstractHttpAdapter {
    const { ExpressAdapter } = loadPackage(
      '@nestjs/platform-express',
      'NestFactory',
      () => require('@nestjs/platform-express'),
    );
    return new ExpressAdapter(httpServer);
  }

  /** 用户显式传入 logger 选项时，覆盖全局日志器 */
  private applyLogger(options: NestApplicationContextOptions | undefined) {
    if (!options || isUndefined(options.logger)) {
      return;
    }
    Logger.overrideLogger(options.logger);
  }

  /**
   * 创建应用代理：属性访问优先走 NestApplication 自身，
   * 若应用上不存在而底层 HTTP 适配器（如 Express 实例）上存在，
   * 则转发给适配器——这使测试中可以直接 `app.getHttpServer()`、
   * `app.use()` 等写法，无需手动解包。
   *
   * @param app - 待代理的 NestApplication 实例。
   * @param adapter - 底层 HTTP 适配器，作为属性回退来源。
   * @returns 代理包装后的应用实例。
   */
  private createAdapterProxy<T>(app: NestApplication, adapter: HttpServer): T {
    return new Proxy(app, {
      get: (receiver: Record<string, any>, prop: string) => {
        if (!(prop in receiver) && prop in adapter) {
          return adapter[prop];
        }
        return receiver[prop];
      },
    }) as any as T;
  }
}
