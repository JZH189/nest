import { Injectable, Optional } from '../decorators/core';
import { isObject } from '../utils/shared.utils';
import { ConsoleLogger } from './console-logger.service';
import { isLogLevelEnabled } from './utils';

export const LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const satisfies string[];

/**
 * @publicApi
 */
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
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
 * @publicApi
 */
@Injectable()
export class Logger implements LoggerService {
  protected static logBuffer = new Array<LogBufferRecord>();
  protected static staticInstanceRef?: LoggerService = DEFAULT_LOGGER;
  protected static logLevels?: LogLevel[];
  private static isBufferAttached: boolean;

  protected localInstanceRef?: LoggerService;

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

  constructor();
  constructor(context: string);
  constructor(context: string, options?: { timestamp?: boolean });
  constructor(
    @Optional() protected context?: string,
    @Optional() protected options: { timestamp?: boolean } = {},
  ) {}

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

  static getTimestamp() {
    return dateTimeFormatter.format(Date.now());
  }

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

  static isLevelEnabled(level: LogLevel): boolean {
    const logLevels = Logger.logLevels;
    return isLogLevelEnabled(level, logLevels);
  }

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
