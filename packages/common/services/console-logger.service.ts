import { inspect, InspectOptions } from 'util';
import { Injectable, Optional } from '../decorators/core';
import { clc, yellow, isColorAllowed } from '../utils/cli-colors.util';
import {
  isFunction,
  isPlainObject,
  isString,
  isUndefined,
} from '../utils/shared.utils';
import { LoggerService, LogLevel } from './logger.service';
import { isLogLevelEnabled } from './utils/is-log-level-enabled.util';

const DEFAULT_DEPTH = 5;

/**
 * @publicApi
 */
export interface ConsoleLoggerOptions {
  /**
   * 启用的日志级别。
   */
  logLevels?: LogLevel[];
  /**
   * 如果启用，将打印当前日志消息与上一条日志消息之间的时间戳（时间差）。
   * 注意：当启用 `json` 时不使用此选项。
   */
  timestamp?: boolean;
  /**
   * 每个日志消息使用的前缀。
   * 注意：当启用 `json` 时不使用此选项。
   */
  prefix?: string;
  /**
   * 如果启用，将以 JSON 格式打印日志消息。
   */
  json?: boolean;
  /**
   * 如果启用，将以彩色打印日志消息。
   * 当禁用 json 时默认为 true，否则为 false。
   */
  colors?: boolean;
  /**
   * 日志记录器的上下文。
   */
  context?: string;
  /**
   * 如果启用，将强制使用 console.log/console.error 而不是 process.stdout/stderr.write。
   * 这对于可以缓冲 console 调用的测试环境（如 Jest）很有用。
   * @default false
   */
  forceConsole?: boolean;
  /**
   * 如果启用，即使是有多个属性的对象，也会将日志消息打印为单行。
   * 如果设置为数字，只要所有属性适合 breakLength，最多 n 个内部元素会在一行上组合。短数组元素也会组合在一起。
   * 当启用 `json` 时默认为 true，否则为 false。
   */
  compact?: boolean | number;
  /**
   * 指定格式化时包含的 Array、TypedArray、Map、Set、WeakMap 和 WeakSet 元素的最大数量。
   * 设置为 null 或 Infinity 显示所有元素。设置为 0 或负数不显示任何元素。
   * 当启用 `json`、禁用 colors 且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。
   * @default 100
   */
  maxArrayLength?: number;
  /**
   * 指定格式化时包含的最大字符数。
   * 设置为 null 或 Infinity 显示所有元素。设置为 0 或负数不显示任何字符。
   * 当启用 `json`、禁用 colors 且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。
   * @default 10000.
   */
  maxStringLength?: number;
  /**
   * 如果启用，格式化对象时将对键进行排序。
   * 也可以是自定义排序函数。
   * 当启用 `json`、禁用 colors 且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。
   * @default false
   */
  sorted?: boolean | ((a: string, b: string) => number);
  /**
   * 指定格式化对象时递归的次数。
   * 这对于检查大型对象很有用。传递 Infinity 或 null 以递归到最大调用堆栈大小。
   * 当启用 `json`、禁用 colors 且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。
   * @default 5
   */
  depth?: number;
  /**
   * 如果为 true，对象的不可枚举符号和属性将包含在格式化结果中。
   * WeakMap 和 WeakSet 条目以及用户定义的原型属性也会被包含。
   * @default false
   */
  showHidden?: boolean;
  /**
   * 输入值拆分为多行的长度。设置为 Infinity 以将输入格式化为单行（与设置为 true 的 "compact" 组合使用）。
   * 当 "compact" 为 true 时默认为 Infinity，否则为 80。
   * 当启用 `json`、禁用 colors 且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。
   */
  breakLength?: number;
}

const DEFAULT_LOG_LEVELS: LogLevel[] = [
  'log',
  'error',
  'warn',
  'debug',
  'verbose',
  'fatal',
];

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
export class ConsoleLogger implements LoggerService {
  /**
   * 日志记录器的选项。
   */
  protected options: ConsoleLoggerOptions;
  /**
   * 日志记录器的上下文（可以手动设置或自动推断）。
   */
  protected context?: string;
  /**
   * 日志记录器的原始上下文（在构造函数中设置）。
   */
  protected originalContext?: string;
  /**
   * 用于 "inspect" 方法的选项。
   */
  protected inspectOptions: InspectOptions;
  /**
   * 上一次打印日志消息的时间戳。
   */
  protected static lastTimestampAt?: number;

  constructor();
  constructor(context: string);
  constructor(options: ConsoleLoggerOptions);
  constructor(context: string, options: ConsoleLoggerOptions);
  constructor(
    @Optional()
    contextOrOptions?: string | ConsoleLoggerOptions,
    @Optional()
    options?: ConsoleLoggerOptions,
  ) {
    // eslint-disable-next-line prefer-const
    let [context, opts] = isString(contextOrOptions)
      ? [contextOrOptions, options]
      : options
        ? [undefined, options]
        : [contextOrOptions?.context, contextOrOptions];

    opts = opts ?? {};
    opts.logLevels ??= DEFAULT_LOG_LEVELS;
    opts.colors ??= opts.colors ?? (opts.json ? false : isColorAllowed());
    opts.prefix ??= 'Nest';

    this.options = opts;
    this.inspectOptions = this.getInspectOptions();

    if (context) {
      this.context = context;
      this.originalContext = context;
    }
  }

  /**
   * 如果配置的级别允许，写入 'log' 级别的日志。
   * 使用换行符打印到 `stdout`。
   */
  log(message: any, context?: string): void;
  log(message: any, ...optionalParams: [...any, string?]): void;
  log(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('log')) {
      return;
    }
    const { messages, context } = this.getContextAndMessagesToPrint([
      message,
      ...optionalParams,
    ]);
    this.printMessages(messages, context, 'log');
  }

  /**
   * 如果配置的级别允许，写入 'error' 级别的日志。
   * 使用换行符打印到 `stderr`。
   */
  error(message: any, stackOrContext?: string): void;
  error(message: any, stack?: string, context?: string): void;
  error(message: any, ...optionalParams: [...any, string?, string?]): void;
  error(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('error')) {
      return;
    }
    const { messages, context, stack } =
      this.getContextAndStackAndMessagesToPrint([message, ...optionalParams]);

    this.printMessages(messages, context, 'error', 'stderr', stack);
    this.printStackTrace(stack!);
  }

  /**
   * 如果配置的级别允许，写入 'warn' 级别的日志。
   * 使用换行符打印到 `stdout`。
   */
  warn(message: any, context?: string): void;
  warn(message: any, ...optionalParams: [...any, string?]): void;
  warn(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('warn')) {
      return;
    }
    const { messages, context } = this.getContextAndMessagesToPrint([
      message,
      ...optionalParams,
    ]);
    this.printMessages(messages, context, 'warn');
  }

  /**
   * 如果配置的级别允许，写入 'debug' 级别的日志。
   * 使用换行符打印到 `stdout`。
   */
  debug(message: any, context?: string): void;
  debug(message: any, ...optionalParams: [...any, string?]): void;
  debug(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('debug')) {
      return;
    }
    const { messages, context } = this.getContextAndMessagesToPrint([
      message,
      ...optionalParams,
    ]);
    this.printMessages(messages, context, 'debug');
  }

  /**
   * 如果配置的级别允许，写入 'verbose' 级别的日志。
   * 使用换行符打印到 `stdout`。
   */
  verbose(message: any, context?: string): void;
  verbose(message: any, ...optionalParams: [...any, string?]): void;
  verbose(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('verbose')) {
      return;
    }
    const { messages, context } = this.getContextAndMessagesToPrint([
      message,
      ...optionalParams,
    ]);
    this.printMessages(messages, context, 'verbose');
  }

  /**
   * 如果配置的级别允许，写入 'fatal' 级别的日志。
   * 使用换行符打印到 `stdout`。
   */
  fatal(message: any, context?: string): void;
  fatal(message: any, ...optionalParams: [...any, string?]): void;
  fatal(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('fatal')) {
      return;
    }
    const { messages, context } = this.getContextAndMessagesToPrint([
      message,
      ...optionalParams,
    ]);
    this.printMessages(messages, context, 'fatal');
  }

  /**
   * 设置日志级别
   * @param levels 日志级别
   */
  setLogLevels(levels: LogLevel[]) {
    if (!this.options) {
      this.options = {};
    }
    this.options.logLevels = levels;
  }

  /**
   * 设置日志记录器上下文
   * @param context 上下文
   */
  setContext(context: string) {
    this.context = context;
  }

  /**
   * 将日志记录器上下文重置为构造函数中传递的值。
   */
  resetContext() {
    this.context = this.originalContext;
  }

  isLevelEnabled(level: LogLevel): boolean {
    const logLevels = this.options?.logLevels;
    return isLogLevelEnabled(level, logLevels);
  }

  protected getTimestamp(): string {
    return dateTimeFormatter.format(Date.now());
  }

  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ) {
    messages.forEach(message => {
      if (this.options.json) {
        this.printAsJson(message, {
          context,
          logLevel,
          writeStreamType,
          errorStack,
        });
        return;
      }
      const pidMessage = this.formatPid(process.pid);
      const contextMessage = this.formatContext(context);
      const timestampDiff = this.updateAndGetTimestampDiff();
      const formattedLogLevel = logLevel.toUpperCase().padStart(7, ' ');
      const formattedMessage = this.formatMessage(
        logLevel,
        message,
        pidMessage,
        formattedLogLevel,
        contextMessage,
        timestampDiff,
      );

      if (this.options.forceConsole) {
        if (writeStreamType === 'stderr') {
          console.error(formattedMessage.trim());
        } else {
          console.log(formattedMessage.trim());
        }
      } else {
        process[writeStreamType ?? 'stdout'].write(formattedMessage);
      }
    });
  }

  protected printAsJson(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
    },
  ) {
    const logObject = this.getJsonLogObject(message, options);
    const formattedMessage =
      !this.options.colors && this.inspectOptions.compact === true
        ? JSON.stringify(logObject, this.stringifyReplacer)
        : inspect(logObject, this.inspectOptions);
    if (this.options.forceConsole) {
      if (options.writeStreamType === 'stderr') {
        console.error(formattedMessage);
      } else {
        console.log(formattedMessage);
      }
    } else {
      process[options.writeStreamType ?? 'stdout'].write(
        `${formattedMessage}\n`,
      );
    }
  }

  protected getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
    },
  ) {
    type JsonLogObject = {
      level: LogLevel;
      pid: number;
      timestamp: number;
      message: unknown;
      context?: string;
      stack?: unknown;
    };

    const logObject: JsonLogObject = {
      level: options.logLevel,
      pid: process.pid,
      timestamp: Date.now(),
      message,
    };

    if (options.context) {
      logObject.context = options.context;
    }

    if (options.errorStack) {
      logObject.stack = options.errorStack;
    }
    return logObject;
  }

  protected formatPid(pid: number) {
    return `[${this.options.prefix}] ${pid}  - `;
  }

  protected formatContext(context: string): string {
    if (!context) {
      return '';
    }

    context = `[${context}] `;
    return this.options.colors ? yellow(context) : context;
  }

  protected formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ) {
    const output = this.stringifyMessage(message, logLevel);
    pidMessage = this.colorize(pidMessage, logLevel);
    formattedLogLevel = this.colorize(formattedLogLevel, logLevel);
    return `${pidMessage}${this.getTimestamp()} ${formattedLogLevel} ${contextMessage}${output}${timestampDiff}\n`;
  }

  protected stringifyMessage(message: unknown, logLevel: LogLevel) {
    if (isFunction(message)) {
      const messageAsStr = Function.prototype.toString.call(message);
      const isClass = messageAsStr.startsWith('class ');
      if (isClass) {
        // If the message is a class, we will display the class name.
        return this.stringifyMessage(message.name, logLevel);
      }
      // If the message is a non-class function, call it and re-resolve its value.
      return this.stringifyMessage(message(), logLevel);
    }

    if (typeof message === 'string') {
      return this.colorize(message, logLevel);
    }

    const outputText = inspect(message, this.inspectOptions);
    if (isPlainObject(message)) {
      return `Object(${Object.keys(message).length}) ${outputText}`;
    }
    if (Array.isArray(message)) {
      return `Array(${message.length}) ${outputText}`;
    }
    return outputText;
  }

  protected colorize(message: string, logLevel: LogLevel) {
    if (!this.options.colors || this.options.json) {
      return message;
    }
    const color = this.getColorByLogLevel(logLevel);
    return color(message);
  }

  protected printStackTrace(stack: string) {
    if (!stack || this.options.json) {
      return;
    }
    if (this.options.forceConsole) {
      console.error(stack);
    } else {
      process.stderr.write(`${stack}\n`);
    }
  }

  protected updateAndGetTimestampDiff(): string {
    const includeTimestamp =
      ConsoleLogger.lastTimestampAt && this.options?.timestamp;
    const result = includeTimestamp
      ? this.formatTimestampDiff(Date.now() - ConsoleLogger.lastTimestampAt!)
      : '';
    ConsoleLogger.lastTimestampAt = Date.now();
    return result;
  }

  protected formatTimestampDiff(timestampDiff: number) {
    const formattedDiff = ` +${timestampDiff}ms`;
    return this.options.colors ? yellow(formattedDiff) : formattedDiff;
  }

  protected getInspectOptions() {
    let breakLength = this.options.breakLength;
    if (typeof breakLength === 'undefined') {
      breakLength = this.options.colors
        ? this.options.compact
          ? Infinity
          : undefined
        : this.options.compact === false
          ? undefined
          : Infinity; // default breakLength to Infinity if inline is not set and colors is false
    }

    const inspectOptions: InspectOptions = {
      depth: this.options.depth ?? DEFAULT_DEPTH,
      sorted: this.options.sorted,
      showHidden: this.options.showHidden,
      compact: this.options.compact ?? (this.options.json ? true : false),
      colors: this.options.colors,
      breakLength,
    };

    if (typeof this.options.maxArrayLength !== 'undefined') {
      inspectOptions.maxArrayLength = this.options.maxArrayLength;
    }
    if (typeof this.options.maxStringLength !== 'undefined') {
      inspectOptions.maxStringLength = this.options.maxStringLength;
    }

    return inspectOptions;
  }

  protected stringifyReplacer(key: string, value: unknown) {
    // Mimic util.inspect behavior for JSON logger with compact on and colors off
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'symbol') {
      return value.toString();
    }

    if (
      value instanceof Map ||
      value instanceof Set ||
      value instanceof Error
    ) {
      return `${inspect(value, this.inspectOptions)}`;
    }
    return value;
  }

  protected getContextAndMessagesToPrint(args: unknown[]) {
    if (args?.length <= 1) {
      return { messages: args, context: this.context };
    }
    const lastElement = args[args.length - 1];
    const isContext = isString(lastElement);
    if (!isContext) {
      return { messages: args, context: this.context };
    }
    return {
      context: lastElement,
      messages: args.slice(0, args.length - 1),
    };
  }

  protected getContextAndStackAndMessagesToPrint(args: unknown[]) {
    if (args.length === 2) {
      return this.isStackFormat(args[1])
        ? {
            messages: [args[0]],
            stack: args[1] as string,
            context: this.context,
          }
        : { ...this.getContextAndMessagesToPrint(args) };
    }

    const { messages, context } = this.getContextAndMessagesToPrint(args);
    if (messages?.length <= 1) {
      return { messages, context };
    }
    const lastElement = messages[messages.length - 1];
    const isStack = isString(lastElement);
    // https://github.com/nestjs/nest/issues/11074#issuecomment-1421680060
    if (!isStack && !isUndefined(lastElement)) {
      return { messages, context };
    }
    return {
      stack: lastElement,
      messages: messages.slice(0, messages.length - 1),
      context,
    };
  }

  protected isStackFormat(stack: unknown) {
    if (!isString(stack) && !isUndefined(stack)) {
      return false;
    }

    return /^(.)+\n\s+at .+:\d+:\d+/.test(stack!);
  }

  protected getColorByLogLevel(level: LogLevel) {
    switch (level) {
      case 'debug':
        return clc.magentaBright;
      case 'warn':
        return clc.yellow;
      case 'error':
        return clc.red;
      case 'verbose':
        return clc.cyanBright;
      case 'fatal':
        return clc.bold;
      default:
        return clc.green;
    }
  }
}
