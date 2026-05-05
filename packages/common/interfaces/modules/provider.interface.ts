import { Scope } from '../scope-options.interface';
import { Type } from '../type.interface';
import { InjectionToken } from './injection-token.interface';
import { OptionalFactoryDependency } from './optional-factory-dependency.interface';

/**
 *
 * @publicApi
 */
export type Provider<T = any> =
  | Type<any>
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ExistingProvider<T>;

/**
 * 定义*类*类型提供者的接口。
 *
 * 例如：
 * ```typescript
 * const configServiceProvider = {
 * provide: ConfigService,
 * useClass:
 *   process.env.NODE_ENV === 'development'
 *     ? DevelopmentConfigService
 *     : ProductionConfigService,
 * };
 * ```
 *
 * @see [类提供者](https://docs.nestjs.cn/fundamentals/custom-providers#class-providers-useclass)
 * @see [注入作用域](https://docs.nestjs.cn/fundamentals/injection-scopes)
 *
 * @publicApi
 */
export interface ClassProvider<T = any> {
  /**
   * 注入令牌
   */
  provide: InjectionToken;
  /**
   * 提供者的类型（类名）（要注入的实例）。
   */
  useClass: Type<T>;
  /**
   * 可选的定义被注入提供者生命周期的枚举。
   */
  scope?: Scope;
  /**
   * 此选项仅在工厂提供者上可用！
   *
   * @see [使用工厂](https://docs.nestjs.cn/fundamentals/custom-providers#factory-providers-usefactory)
   */
  inject?: never;
  /**
   * 将提供者标记为持久的。此标志可与自定义上下文 ID 工厂策略结合使用，
   * 以构建惰性 DI 子树。
   *
   * 此标志只能与 scope = Scope.REQUEST 结合使用。
   */
  durable?: boolean;
}

/**
 * 定义*值*类型提供者的接口。
 *
 * 例如：
 * ```typescript
 * const connectionProvider = {
 *   provide: 'CONNECTION',
 *   useValue: connection,
 * };
 * ```
 *
 * @see [值提供者](https://docs.nestjs.cn/fundamentals/custom-providers#value-providers-usevalue)
 *
 * @publicApi
 */
export interface ValueProvider<T = any> {
  /**
   * 注入令牌
   */
  provide: InjectionToken;
  /**
   * 要注入的提供者实例。
   */
  useValue: T;
  /**
   * 此选项仅在工厂提供者上可用！
   *
   * @see [使用工厂](https://docs.nestjs.cn/fundamentals/custom-providers#factory-providers-usefactory)
   */
  inject?: never;
}

/**
 * 定义*工厂*类型提供者的接口。
 *
 * 例如：
 * ```typescript
 * const connectionFactory = {
 *   provide: 'CONNECTION',
 *   useFactory: (optionsProvider: OptionsProvider) => {
 *     const options = optionsProvider.get();
 *     return new DatabaseConnection(options);
 *   },
 *   inject: [OptionsProvider],
 * };
 * ```
 *
 * @see [工厂提供者](https://docs.nestjs.cn/fundamentals/custom-providers#factory-providers-usefactory)
 * @see [注入作用域](https://docs.nestjs.cn/fundamentals/injection-scopes)
 *
 * @publicApi
 */
export interface FactoryProvider<T = any> {
  /**
   * 注入令牌
   */
  provide: InjectionToken;
  /**
   * 返回要注入的提供者实例的工厂函数。
   */
  useFactory: (...args: any[]) => T | Promise<T>;
  /**
   * 可选的提供者列表，将被注入到工厂函数的上下文中。
   */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /**
   * 可选的枚举，定义工厂函数返回的提供者的生命周期。
   */
  scope?: Scope;
  /**
   * 将提供者标记为持久的。此标志可与自定义上下文 ID 工厂策略结合使用，
   * 以构建惰性 DI 子树。
   *
   * 此标志只能与 scope = Scope.REQUEST 结合使用。
   */
  durable?: boolean;
}

/**
 * 定义*现有*（别名）类型提供者的接口。
 *
 * 例如：
 * ```typescript
 * const loggerAliasProvider = {
 *   provide: 'AliasedLoggerService',
 *   useExisting: LoggerService
 * };
 * ```
 *
 * @see [别名提供者](https://docs.nestjs.cn/fundamentals/custom-providers#alias-providers-useexisting)
 *
 * @publicApi
 */
export interface ExistingProvider<T = any> {
  /**
   * 注入令牌
   */
  provide: InjectionToken;
  /**
   * 要被注入令牌别名的提供者。
   */
  useExisting: any;
}
