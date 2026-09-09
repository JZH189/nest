import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';
import { GuardsConsumer, GuardsContextCreator } from '@nestjs/core/guards';
import { NestContainer } from '@nestjs/core/injector/container';
import { Injector } from '@nestjs/core/injector/injector';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import {
  InterceptorsConsumer,
  InterceptorsContextCreator,
} from '@nestjs/core/interceptors';
import { PipesConsumer, PipesContextCreator } from '@nestjs/core/pipes';
import { ClientProxyFactory } from './client';
import { ClientsContainer } from './container';
import { ExceptionFiltersContext } from './context/exception-filters-context';
import { RpcContextCreator } from './context/rpc-context-creator';
import { RpcProxy } from './context/rpc-proxy';
import { ListenersController } from './listeners-controller';
import { Server } from './server/server';

/**
 * 微服务模块：连接 IoC 容器与微服务传输层的桥梁。
 *
 * 职责：
 * 1. register()：构建 RpcContextCreator（整合管道/Guard/拦截器/异常过滤器）与 ListenersController；
 * 2. setupListeners()：遍历容器中所有模块的控制器，把 @EventPattern / @MessagePattern
 *    声明的消息处理器绑定到服务端实例（Server）上；
 * 3. setupClients()：遍历控制器与 provider 实例，把 @Client 声明的客户端注入到对应属性；
 * 4. close()：应用关闭时关闭所有已创建的 ClientProxy 客户端连接。
 */
export class MicroservicesModule<
  TAppOptions extends NestApplicationContextOptions =
    NestApplicationContextOptions,
> {
  private readonly clientsContainer = new ClientsContainer();
  private listenersController: ListenersController;
  private appOptions: TAppOptions;

  /**
   * 初始化微服务模块：构建 RPC 上下文创建器与监听器控制器。
   * @param container - 根 IoC 容器
   * @param graphInspector - 依赖图检查器，用于记录客户端与处理器信息
   * @param config - 应用配置（全局过滤器等）
   * @param options - 微服务应用选项
   */
  public register(
    container: NestContainer,
    graphInspector: GraphInspector,
    config: ApplicationConfig,
    options: TAppOptions,
  ) {
    this.appOptions = options;
    const exceptionFiltersContext = new ExceptionFiltersContext(
      container,
      config,
    );
    const contextCreator = new RpcContextCreator(
      new RpcProxy(),
      exceptionFiltersContext,
      new PipesContextCreator(container, config),
      new PipesConsumer(),
      new GuardsContextCreator(container, config),
      new GuardsConsumer(),
      new InterceptorsContextCreator(container, config),
      new InterceptorsConsumer(),
    );

    const injector = new Injector({
      preview: container.contextOptions?.preview!,
      instanceDecorator:
        container.contextOptions?.instrument?.instanceDecorator,
    });
    this.listenersController = new ListenersController(
      this.clientsContainer,
      contextCreator,
      container,
      injector,
      ClientProxyFactory,
      exceptionFiltersContext,
      graphInspector,
    );
  }

  /**
   * 遍历容器中所有模块，将各控制器的模式处理器绑定到服务端实例。
   * @param container - 根 IoC 容器
   * @param serverInstance - 微服务底层服务端实例（负责实际的消息收发）
   */
  public setupListeners(container: NestContainer, serverInstance: Server) {
    if (!this.listenersController) {
      throw new RuntimeException();
    }
    const modules = container.getModules();
    modules.forEach(({ controllers }, moduleRef) =>
      this.bindListeners(controllers, serverInstance, moduleRef),
    );
  }

  /**
   * 遍历容器中所有模块，把 @Client 装饰的属性绑定到对应的 ClientProxy 实例。
   * preview 模式（仅生成依赖图、不启动应用）下会跳过该步骤。
   * @param container - 根 IoC 容器
   */
  public setupClients(container: NestContainer) {
    if (!this.listenersController) {
      throw new RuntimeException();
    }
    if (this.appOptions?.preview) {
      return;
    }
    const modules = container.getModules();
    modules.forEach(({ controllers, providers }) => {
      this.bindClients(controllers);
      this.bindClients(providers);
    });
  }

  /**
   * 将一组控制器中的模式处理器绑定到服务端。
   * @param controllers - 模块内的控制器实例包装 Map
   * @param serverInstance - 底层服务端实例
   * @param moduleName - 控制器所在模块名（用于图检查器记录）
   */
  public bindListeners(
    controllers: Map<string | symbol | Function, InstanceWrapper<Controller>>,
    serverInstance: Server,
    moduleName: string,
  ) {
    controllers.forEach(wrapper =>
      this.listenersController.registerPatternHandlers(
        wrapper,
        serverInstance,
        moduleName,
      ),
    );
  }

  /**
   * 为一组实例（控制器或 provider）中 @Client 声明的属性注入客户端实例。
   * @param items - 实例包装 Map（controllers 或 providers）
   */
  public bindClients(
    items: Map<string | symbol | Function, InstanceWrapper<unknown>>,
  ) {
    items.forEach(({ instance, isNotMetatype }) => {
      !isNotMetatype &&
        this.listenersController.assignClientsToProperties(instance as object);
    });
  }

  /**
   * 关闭所有已创建的客户端连接并清空客户端容器。
   */
  public async close() {
    const clients = this.clientsContainer.getAllClients();
    await Promise.all(clients.map(client => client.close()));
    this.clientsContainer.clear();
  }
}
