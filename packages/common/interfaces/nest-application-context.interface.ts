import { ShutdownSignal } from '../enums/shutdown-signal.enum';
import { LoggerService, LogLevel } from '../services/logger.service';
import { DynamicModule } from './modules';
import { NestApplicationContextOptions } from './nest-application-context-options.interface';
import { ShutdownHooksOptions } from './shutdown-hooks-options.interface';
import { Type } from './type.interface';

export type SelectOptions = Pick<NestApplicationContextOptions, 'abortOnError'>;

export interface GetOrResolveOptions {
  /**
   * 如果启用，查找将仅在宿主模块中执行。
   * @default false
   */
  strict?: boolean;
  /**
   * 如果启用，将返回一个实例列表，而不是返回在给定令牌下注册的第一个实例。
   * @default false
   */
  each?: boolean;
}

/**
 * 定义 NestApplicationContext 的接口。
 *
 * @publicApi
 */
export interface INestApplicationContext {
  /**
   * 允许在模块树中导航，例如，从选定的模块中提取特定实例。
   * @returns {INestApplicationContext}
   */
  select<T>(
    module: Type<T> | DynamicModule,
    options?: SelectOptions,
  ): INestApplicationContext;

  /**
   * 获取可注入对象或控制器的实例，如果不存在则抛出异常。
   * @returns {TResult}
   */
  get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
  ): TResult;
  /**
   * 获取可注入对象或控制器的实例，如果不存在则抛出异常。
   * @returns {TResult}
   */
  get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options: { strict?: boolean; each?: undefined | false },
  ): TResult;
  /**
   * 获取可注入对象或控制器实例的列表，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options: { strict?: boolean; each: true },
  ): Array<TResult>;
  /**
   * 获取可注入对象或控制器的一个实例（或实例列表），如果不存在则抛出异常。
   * @returns {TResult | Array<TResult>}
   */
  get<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    options?: GetOrResolveOptions,
  ): TResult | Array<TResult>;

  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
  ): Promise<TResult>;
  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: { id: number },
  ): Promise<TResult>;
  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: { id: number },
    options?: { strict?: boolean; each?: undefined | false },
  ): Promise<TResult>;
  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例，如果不存在则抛出异常。
   * @returns {Array<TResult>}
   */
  resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: { id: number },
    options?: { strict?: boolean; each: true },
  ): Promise<Array<TResult>>;
  /**
   * 解析可注入对象或控制器的临时实例或请求作用域实例（列表），如果不存在则抛出异常。
   * @returns {Promise<TResult | Array<TResult>>}
   */
  resolve<TInput = any, TResult = TInput>(
    typeOrToken: Type<TInput> | Function | string | symbol,
    contextId?: { id: number },
    options?: GetOrResolveOptions,
  ): Promise<TResult | Array<TResult>>;

  /**
   * 为给定的上下文 ID（DI 容器子树）注册请求/上下文对象。
   * @returns {void}
   */
  registerRequestByContextId<T = any>(
    request: T,
    contextId: { id: number },
  ): void;

  /**
   * 终止应用程序
   * @returns {Promise<void>}
   */
  close(): Promise<void>;

  /**
   * 设置自定义日志服务。
   * 如果自动刷新开启，则刷新缓冲的日志。
   * @returns {void}
   */
  useLogger(logger: LoggerService | LogLevel[] | false): void;

  /**
   * 打印缓冲的日志并分离缓冲区。
   * @returns {void}
   */
  flushLogs(): void;

  /**
   * 启用关闭钩子的使用。当进程收到关闭信号时，
   * 将调用提供者的 `onApplicationShutdown` 函数。
   *
   * @param {ShutdownSignal[] | string[]} [signals] 要监听的系统信号
   * @param {ShutdownHooksOptions} [options] 配置关闭钩子行为的选项
   *
   * @returns {this} Nest 应用上下文实例
   */
  enableShutdownHooks(
    signals?: ShutdownSignal[] | string[],
    options?: ShutdownHooksOptions,
  ): this;

  /**
   * 初始化 Nest 应用程序。
   * 调用 Nest 生命周期事件。
   * 不一定要直接调用此方法。
   *
   * @returns {Promise<this>} 返回 Promise 形式的 NestApplicationContext 实例
   */
  init(): Promise<this>;
}
