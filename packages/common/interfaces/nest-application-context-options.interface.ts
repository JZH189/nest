import { LoggerService, LogLevel } from '../services/logger.service';

/**
 * @publicApi
 */
export class NestApplicationContextOptions {
  /**
   * 指定要使用的日志记录器。传递 `false` 以关闭日志记录。
   */
  logger?: LoggerService | LogLevel[] | false;

  /**
   * 是否在错误时中止进程。默认情况下，进程会退出。
   * 传递 `false` 以覆盖默认行为。如果传递 `false`，Nest 不会退出应用程序，
   * 而是会重新抛出异常。
   * @default true
   */
  abortOnError?: boolean | undefined;

  /**
   * 如果启用，日志将被缓冲，直到调用 "Logger#flush" 方法。
   * @default false
   */
  bufferLogs?: boolean;

  /**
   * 如果启用，日志将在应用程序初始化过程完成或失败时自动刷新并分离缓冲区。
   * @default true
   */
  autoFlushLogs?: boolean;

  /**
   * 是否以预览模式运行应用程序。
   * 在预览模式下，提供者/控制器不会被实例化和解析。
   *
   * @default false
   */
  preview?: boolean;

  /**
   * 是否生成序列化的图形快照。
   *
   * @default false
   */
  snapshot?: boolean;

  /**
   * 确定使用什么算法生成模块 ID。
   * 当设置为 `deep-hash` 时，模块 ID 基于序列化的模块定义生成。
   * 当设置为 `reference` 时，每个模块根据其引用获得唯一的 ID。
   *
   * @default 'reference'
   */
  moduleIdGeneratorAlgorithm?: 'deep-hash' | 'reference';

  /**
   * 为应用程序上下文添加检测功能。
   * 此选项允许你向应用程序上下文添加自定义检测。
   */
  instrument?: {
    /**
     * 装饰应用程序上下文创建的每个实例的函数。
     * 此函数可用于向实例添加自定义属性或方法。
     * @param instance 要装饰的实例。
     * @returns 装饰后的实例。
     */
    instanceDecorator: (instance: unknown) => unknown;
  };

  /**
   * 如果启用，将强制在默认的 ConsoleLogger 中使用 console.log/console.error 而不是 process.stdout/stderr.write。
   * 这对于可以缓冲控制台调用的 Jest 等测试环境很有用。
   * @default false
   */
  forceConsole?: boolean;
}
