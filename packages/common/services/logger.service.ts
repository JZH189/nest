import { Injectable, Optional } from '../decorators/core';
import { isObject } from '../utils/shared.utils';
import { ConsoleLogger } from './console-logger.service';
import { isLogLevelEnabled } from './utils';

/**
 * 支持的全部日志级别（按详细程度从高到低排列）
 */
export const LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const satisfies string[];

/**
 * 日志级别类型（'verbose' | 'debug' | 'log' | 'warn' | 'error' | 'fatal'）
 *
 * @publicApi
 */
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * NestJS 日志服务的接口契约：自定义日志器（如接入 winston、pino）
 * 需要实现该接口才能被框架使用
 *
 * @publicApi
 */
export interface LoggerService {
  /**
   * 写入 'log' 级别的日志。
   */
  log(message: any, ...optionalParams: any[]): any;

  /**
   * 写入 'error' 级别的日志。
   */
  error(message: any, ...optionalParams: any[]): any;

  /**
   * 写入 'warn' 级别的日志。
   */
  warn(message: any, ...optionalParams: any[]): any;

  /**
   * 写入 'debug' 级别的日志。
   */
  debug?(message: any, ...optionalParams: any[]): any;

  /**
   * 写入 'verbose' 级别的日志。
   */
  verbose?(message: any, ...optionalParams: any[]): any;

  /**
   * 写入 'fatal' 级别的日志。
   */
  fatal?(message: any, ...optionalParams: any[]): any;

  /**
   * 设置日志级别。
   * @param levels 日志级别
   */
  setLogLevels?(levels: LogLevel[]): any;
}

/**
 * 日志缓冲区记录项：暂存待延迟执行的方法引用与参数
 */
interface LogBufferRecord {
  /**
   * 要执行的方法。
   */
  methodRef: Function;

  /**
   * 传递给方法的参数。
   */
  arguments: unknown[];
}

const DEFAULT_LOGGER = new ConsoleLogger();

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  day: '2-digit',
  month: '2-digit',
});

/**
 * NestJS 内置的日志器（Logger）
 *
 * 既可作为实例注入（@Injectable），也可以像 `Logger.log(...)` 一样静态调用。
 * 实例方法会委托给"本地实例"或"全局静态实例"（默认 ConsoleLogger），
 * 并自动补上构造时传入的上下文名称（context）。
 * 所有方法均通过 @WrapBuffer 装饰器包裹：在应用启动阶段（attachBuffer 期间）
 * 日志会被暂存到缓冲区，待 flush() 后统一输出。
 * 可通过 static overrideLogger 替换为自定义的 LoggerService 实现。
 *
 * @publicApi
 */
@Injectable()
export class Logger implements LoggerService {
  /**
   * 启动阶段暂存日志的缓冲区
   */
  protected static logBuffer = new Array<LogBufferRecord>();
  /**
   * 全局静态日志器实例（默认为 ConsoleLogger）
   */
  protected static staticInstanceRef?: LoggerService = DEFAULT_LOGGER;
  /**
   * 全局日志级别过滤配置
   */
  protected static logLevels?: LogLevel[];
  /**
   * 是否已附加缓冲区（true 时日志写入缓冲区而非直接输出）
   */
  private static isBufferAttached: boolean;

  /**
   * 当前实例的私有日志器（延迟创建的 ConsoleLogger）
   */
  protected localInstanceRef?: LoggerService;

  /**
   * 方法装饰器：包裹日志方法，
   * 缓冲区附加期间把调用（方法+参数）暂存到 logBuffer，否则直接执行原方法
   */
  private static WrapBuffer: MethodDecorator = (
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    const originalFn = descriptor.value;
    descriptor.value = function (...args: unknown[]) {
      if (Logger.isBufferAttached) {
        Logger.logBuffer.push({
          methodRef: originalFn.bind(this),
          arguments: args,
        });
        return;
      }
      return originalFn.call(this, ...args);
    };
  };

  /**
   * 构造函数（可传入上下文名称与时间戳选项）
   *
   * @param context 日志上下文名称（显示在日志行中，如类名）
   * @param options 额外选项（是否在日志中附加时间戳）
   */
  constructor();
  constructor(context: string);
  constructor(context: string, options?: { timestamp?: boolean });
  constructor(
    @Optional() protected context?: string,
    @Optional() protected options: { timestamp?: boolean } = {},
  ) {}

  /**
   * 获取当前实例应使用的日志器：
   * 全局实例为默认 ConsoleLogger（或纯 Logger 实例）时，
   * 延迟创建带本实例上下文的 ConsoleLogger；否则复用全局静态实例
   */
  get localInstance(): LoggerService {
    if (Logger.staticInstanceRef === DEFAULT_LOGGER) {
      return this.registerLocalInstanceRef();
    } else if (Logger.staticInstanceRef instanceof Logger) {
      const prototype = Object.getPrototypeOf(Logger.staticInstanceRef);
      if (prototype.constructor === Logger) {
        return this.registerLocalInstanceRef();
      }
    }
    return Logger.staticInstanceRef!;
  }

  /**
   * 写入 'error' 级别的日志。
   */
  error(message: any, stack?: string, context?: string): void;
  error(message: any, ...optionalParams: [...any, string?, string?]): void;
  @Logger.WrapBuffer
  error(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? (optionalParams.length ? optionalParams : [undefined]).concat(
          this.context,
        )
      : optionalParams;

    this.localInstance?.error(message, ...optionalParams);
  }

  /**
   * 写入 'log' 级别的日志。
   */
  log(message: any, context?: string): void;
  log(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  log(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams;
    this.localInstance?.log(message, ...optionalParams);
  }

  /**
   * 写入 'warn' 级别的日志。
   */
  warn(message: any, context?: string): void;
  warn(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  warn(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams;
    this.localInstance?.warn(message, ...optionalParams);
  }

  /**
   * 写入 'debug' 级别的日志。
   */
  debug(message: any, context?: string): void;
  debug(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  debug(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams;
    this.localInstance?.debug?.(message, ...optionalParams);
  }

  /**
   * 写入 'verbose' 级别的日志。
   */
  verbose(message: any, context?: string): void;
  verbose(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  verbose(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams;
    this.localInstance?.verbose?.(message, ...optionalParams);
  }

  /**
   * 写入 'fatal' 级别的日志。
   */
  fatal(message: any, context?: string): void;
  fatal(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  fatal(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams;
    this.localInstance?.fatal?.(message, ...optionalParams);
  }

  /**
   * 写入 'error' 级别的日志。
   */
  static error(message: any, stackOrContext?: string): void;
  static error(message: any, context?: string): void;
  static error(message: any, stack?: string, context?: string): void;
  static error(
    message: any,
    ...optionalParams: [...any, string?, string?]
  ): void;
  @Logger.WrapBuffer
  static error(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.error(message, ...optionalParams);
  }

  /**
   * 写入 'log' 级别的日志。
   */
  static log(message: any, context?: string): void;
  static log(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  static log(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.log(message, ...optionalParams);
  }

  /**
   * 写入 'warn' 级别的日志。
   */
  static warn(message: any, context?: string): void;
  static warn(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  static warn(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.warn(message, ...optionalParams);
  }

  /**
   * 写入 'debug' 级别的日志（如果配置的日志级别允许）。
   * 打印到 `stdout` 并换行。
   */
  static debug(message: any, context?: string): void;
  static debug(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  static debug(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.debug?.(message, ...optionalParams);
  }

  /**
   * 写入 'verbose' 级别的日志。
   */
  static verbose(message: any, context?: string): void;
  static verbose(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  static verbose(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.verbose?.(message, ...optionalParams);
  }

  /**
   * 写入 'fatal' 级别的日志。
   */
  static fatal(message: any, context?: string): void;
  static fatal(message: any, ...optionalParams: [...any, string?]): void;
  @Logger.WrapBuffer
  static fatal(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.fatal?.(message, ...optionalParams);
  }

  /**
   * 打印缓冲的日志并分离缓冲区。
   */
  static flush() {
    this.isBufferAttached = false;
    this.logBuffer.forEach(item =>
      item.methodRef(...(item.arguments as [string])),
    );
    this.logBuffer = [];
  }

  /**
   * 附加缓冲区。
   * 开启初始化日志缓冲。
   */
  static attachBuffer() {
    this.isBufferAttached = true;
  }

  /**
   * 分离缓冲区。
   * 关闭初始化日志缓冲。
   */
  static detachBuffer() {
    this.isBufferAttached = false;
  }

  /**
   * 获取格式化的当前时间戳（本地时区）
   *
   * @returns 形如 "2024/01/02 上午10:00:00" 的时间戳字符串
   */
  static getTimestamp() {
    return dateTimeFormatter.format(Date.now());
  }

  /**
   * 覆盖全局日志器：可传入自定义 LoggerService 实例、
   * 日志级别数组，或 `false` 关闭日志输出
   *
   * @param logger 自定义日志器 / 日志级别数组 / `false`
   * @throws 传入继承自 Logger（而非 ConsoleLogger）的实例时抛出 `Error`
   */
  static overrideLogger(logger: LoggerService | LogLevel[] | boolean) {
    if (Array.isArray(logger)) {
      Logger.logLevels = logger;
      return this.staticInstanceRef?.setLogLevels?.(logger);
    }
    if (isObject(logger)) {
      if (logger instanceof Logger && logger.constructor !== Logger) {
        const errorMessage = `Using the "extends Logger" instruction is not allowed in Nest v9. Please, use "extends ConsoleLogger" instead.`;
        this.staticInstanceRef?.error(errorMessage);
        throw new Error(errorMessage);
      }
      this.staticInstanceRef = logger as LoggerService;
    } else {
      this.staticInstanceRef = undefined;
    }
  }

  /**
   * 判断指定日志级别当前是否被允许输出
   *
   * @param level 待检查的日志级别
   * @returns 该级别已启用（或未配置过滤）则返回 `true`
   */
  static isLevelEnabled(level: LogLevel): boolean {
    const logLevels = Logger.logLevels;
    return isLogLevelEnabled(level, logLevels);
  }

  /**
   * 延迟创建并复用本地 ConsoleLogger 实例（携带实例上下文与全局日志级别）
   */
  private registerLocalInstanceRef() {
    if (this.localInstanceRef) {
      return this.localInstanceRef;
    }
    this.localInstanceRef = new ConsoleLogger(this.context!, {
      timestamp: this.options?.timestamp,
      logLevels: Logger.logLevels,
    });
    return this.localInstanceRef;
  }
}
