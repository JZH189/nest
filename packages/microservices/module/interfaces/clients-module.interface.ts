import { ClientOptions, CustomClientOptions } from '../../interfaces';
import { Type, Provider, ModuleMetadata } from '@nestjs/common/interfaces';

/**
 * 客户端提供者类型：既可以是内置传输器的客户端配置（ClientOptions），
 * 也可以是自定义传输策略的客户端配置（CustomClientOptions）。
 */
export type ClientProvider = ClientOptions | CustomClientOptions;

/**
 * 单个客户端的注册配置：在 ClientProvider 基础上强制要求 name 字段，
 * name 即注入时使用的 Provider token（@Inject(name)）。
 */
export type ClientProviderOptions = ClientProvider & {
  /** 客户端的注入 token（字符串或 Symbol）。 */
  name: string | symbol;
};

/**
 * ClientsModule.register() 的选项：可以是客户端配置数组，
 * 也可以是包含 clients 与 isGlobal 的对象（isGlobal 为 true 时模块全局可用）。
 */
export type ClientsModuleOptions =
  | Array<ClientProviderOptions>
  | {
      /** 客户端配置列表。 */
      clients: Array<ClientProviderOptions>;
      /** 是否把注册的客户端提升为全局 Provider。 */
      isGlobal?: boolean;
    };

/**
 * 异步客户端选项工厂接口：registerAsync 的 useExisting/useClass
 * 指定的类需要实现该接口，通过 createClientOptions() 返回客户端配置。
 */
export interface ClientsModuleOptionsFactory {
  /**
   * 创建客户端配置。
   * @returns 客户端配置（同步或异步返回）
   */
  createClientOptions(): Promise<ClientProvider> | ClientProvider;
}

/**
 * 单个客户端的异步注册配置：与 Nest 通用异步 Provider 约定一致，
 * 支持三种方式之一 —— useFactory / useExisting / useClass。
 */
export interface ClientsProviderAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  /** 复用已存在的选项工厂类实例。 */
  useExisting?: Type<ClientsModuleOptionsFactory>;
  /** 指定选项工厂类，由 DI 容器实例化后调用其 createClientOptions()。 */
  useClass?: Type<ClientsModuleOptionsFactory>;
  /** 自定义工厂函数，返回客户端配置。 */
  useFactory?: (...args: any[]) => Promise<ClientProvider> | ClientProvider;
  /** 工厂函数的依赖注入列表。 */
  inject?: any[];
  /** 额外注册到模块中的 Provider。 */
  extraProviders?: Provider[];
  /** 客户端的注入 token。 */
  name: string | symbol;
}

/**
 * ClientsModule.registerAsync() 的选项：可以是异步客户端配置数组，
 * 也可以是包含 clients 与 isGlobal 的对象。
 */
export type ClientsModuleAsyncOptions =
  | Array<ClientsProviderAsyncOptions>
  | {
      /** 异步客户端配置列表。 */
      clients: Array<ClientsProviderAsyncOptions>;
      /** 是否把注册的客户端提升为全局 Provider。 */
      isGlobal?: boolean;
    };
