import {
  DynamicModule,
  ForwardReference,
  Module,
  OnApplicationShutdown,
  Provider,
  Type,
} from '@nestjs/common';
import { ClientProxy, ClientProxyFactory } from '../client';
import {
  ClientsModuleAsyncOptions,
  ClientsModuleOptions,
  ClientsModuleOptionsFactory,
  ClientsProviderAsyncOptions,
} from './interfaces';

/**
 * 微服务客户端注册模块：用于在普通（HTTP）应用中注册微服务客户端代理。
 *
 * 通过 register()/registerAsync() 声明客户端配置后，会为每个客户端创建一个
 * Provider（token 为配置中的 name），其值为由 ClientProxyFactory 创建的
 * ClientProxy 实例；模块同时把这些 Provider 导出，供 @Inject(name) 注入使用。
 *
 * 用法示例：
 * ClientsModule.register([{ name: 'MATH_SERVICE', transport: Transport.TCP }])
 */
@Module({})
export class ClientsModule {
  /**
   * 同步注册微服务客户端。
   * @param options 客户端配置数组，或包含 clients 与 isGlobal 的对象
   * @returns 动态模块定义（providers/exports 为每个客户端对应的 ClientProxy Provider）
   */
  static register(options: ClientsModuleOptions): DynamicModule {
    // 1. 兼容两种配置形式：数组或 { clients, isGlobal } 对象
    const clientsOptions = !Array.isArray(options) ? options.clients : options;
    // 2. 为每个客户端配置创建 Provider：token 为 name，值为 ClientProxy 实例
    const clients = (clientsOptions || []).map(item => {
      return {
        provide: item.name,
        useValue: this.assignOnAppShutdownHook(ClientProxyFactory.create(item)),
      };
    });
    return {
      module: ClientsModule,
      global: !Array.isArray(options) && options.isGlobal,
      providers: clients,
      exports: clients,
    };
  }

  /**
   * 异步注册微服务客户端（支持 useFactory/useExisting/useClass 三种异步配置方式）。
   * @param options 异步客户端配置数组，或包含 clients 与 isGlobal 的对象
   * @returns 动态模块定义（含异步解析客户端选项所需的 providers 与 imports）
   */
  static registerAsync(options: ClientsModuleAsyncOptions): DynamicModule {
    // 1. 兼容两种配置形式：数组或 { clients, isGlobal } 对象
    const clientsOptions = !Array.isArray(options) ? options.clients : options;
    // 2. 为每个客户端创建异步 Provider，并合并用户提供的额外 Provider
    const providers: Provider[] = clientsOptions.reduce(
      (accProviders: Provider[], item) =>
        accProviders
          .concat(this.createAsyncProviders(item))
          .concat(item.extraProviders || []),
      [],
    );
    // 3. 去重合并各客户端配置中声明的 imports（供异步工厂注入依赖）
    const imports = clientsOptions.reduce(
      (accImports, option) => {
        if (!option.imports) {
          return accImports;
        }
        const toInsert = option.imports.filter(
          item => !accImports.includes(item),
        );
        return accImports.concat(toInsert);
      },
      [] as Array<
        DynamicModule | Promise<DynamicModule> | ForwardReference | Type
      >,
    );
    return {
      module: ClientsModule,
      global: !Array.isArray(options) && options.isGlobal,
      imports,
      providers: providers,
      exports: providers,
    };
  }

  /**
   * 为单个客户端创建异步 Provider 集合。
   * @param options 单个客户端的异步配置
   * @returns Provider 数组（选项工厂 + 可能的 useClass 实例化 Provider）
   */
  private static createAsyncProviders(
    options: ClientsProviderAsyncOptions,
  ): Provider[] {
    // 1. useExisting/useFactory 直接复用选项 Provider；useClass 还需额外
    //    注册一个「实例化该工厂类」的 Provider
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }
    return [
      this.createAsyncOptionsProvider(options),
      {
        provide: options.useClass!,
        useClass: options.useClass!,
      },
    ];
  }

  /**
   * 创建「客户端选项」异步 Provider：最终 provide 的值是
   * 由工厂解析出的 ClientProxy 实例（而非选项对象）。
   * @param options 单个客户端的异步配置
   * @returns 异步选项 Provider
   */
  private static createAsyncOptionsProvider(
    options: ClientsProviderAsyncOptions,
  ): Provider {
    // 1. useFactory：直接调用用户工厂获取客户端配置
    if (options.useFactory) {
      return {
        provide: options.name,
        useFactory: this.createFactoryWrapper(options.useFactory),
        inject: options.inject || [],
      };
    }
    // 2. useExisting/useClass：注入工厂类实例，调用其 createClientOptions()
    return {
      provide: options.name,
      useFactory: this.createFactoryWrapper(
        (optionsFactory: ClientsModuleOptionsFactory) =>
          optionsFactory.createClientOptions(),
      ),
      inject: [options.useExisting || options.useClass!],
    };
  }

  /**
   * 包装用户的异步工厂：在工厂返回客户端配置后，用 ClientProxyFactory
   * 创建 ClientProxy 并挂载关闭钩子。
   * @param useFactory 用户的客户端配置工厂函数
   * @returns 返回 ClientProxy 实例的异步工厂
   */
  private static createFactoryWrapper(
    useFactory: ClientsProviderAsyncOptions['useFactory'],
  ) {
    return async (...args: any[]) => {
      const clientOptions = await useFactory!(...args);
      const clientProxyRef = ClientProxyFactory.create(clientOptions);
      return this.assignOnAppShutdownHook(clientProxyRef);
    };
  }

  /**
   * 把应用关闭钩子（onApplicationShutdown）绑定到 ClientProxy 的 close
   * 方法上，保证应用优雅停机时自动断开客户端连接。
   * @param client 客户端代理实例
   * @returns 挂载了关闭钩子的同一实例
   */
  private static assignOnAppShutdownHook(client: ClientProxy) {
    (client as unknown as OnApplicationShutdown).onApplicationShutdown =
      client.close;
    return client;
  }
}
