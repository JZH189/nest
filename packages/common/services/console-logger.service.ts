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
 * ConsoleLogger 的配置选项
 *
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
 * 基于 Node.js console/process 输出流的默认日志器实现。
 *
 * 实现 LoggerService 接口，是 NestJS 应用启动与运行时的默认日志输出器：
 * 支持日志级别过滤、彩色输出、JSON 结构化输出、上下文前缀、
 * 时间戳差值显示等特性，输出会带上进程 PID 与 "Nest" 前缀。
 * 自定义日志器建议继承该类（而非旧的 Logger）。
 *
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

  /**
   * 构造函数：解析上下文与选项，应用默认值（日志级别、颜色、前缀等）
   *
   * @param contextOrOptions 上下文名称或选项对象（支持多种重载形式）
   * @param options 选项对象（当第一个参数为上下文名称时使用）
   */
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

  /**
   * 判断指定日志级别当前是否被允许输出
   *
   * @param level 待检查的日志级别
   * @returns 该级别已启用（或未配置过滤）则返回 `true`
   */
  isLevelEnabled(level: LogLevel): boolean {
    const logLevels = this.options?.logLevels;
    return isLogLevelEnabled(level, logLevels);
  }

  /**
   * 获取格式化的当前时间戳（本地时区）
   *
   * @returns 时间戳字符串
   */
  protected getTimestamp(): string {
    return dateTimeFormatter.format(Date.now());
  }

  /**
   * 打印一组日志消息：按 JSON 或文本格式逐条输出，
   * 文本格式会拼装 PID 前缀、级别、上下文、时间戳差值等信息
   *
   * @param messages 待打印的消息列表
   * @param context 日志上下文
   * @param logLevel 日志级别
   * @param writeStreamType 输出流类型（`stdout` 或 `stderr`，默认 `stdout`）
   * @param errorStack 错误堆栈（error 级别时附带）
   */
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

  /**
   * 以 JSON 格式打印日志：构造结构化日志对象后，
   * 用 JSON.stringify（紧凑且无彩色时）或 util.inspect 序列化输出
   *
   * @param message 待打印的消息
   * @param options 打印上下文（级别、输出流、上下文名、错误堆栈等）
   */
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

  /**
   * 构造结构化的 JSON 日志对象（level/pid/timestamp/message，
   * 视情况附带 context 与 stack）
   *
   * @param message 待打印的消息
   * @param options 打印上下文
   * @returns 结构化日志对象
   */
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

  /**
   * 格式化进程 PID 前缀，形如 "[Nest] 12345  - "
   *
   * @param pid 当前进程 ID
   * @returns PID 前缀字符串
   */
  protected formatPid(pid: number) {
    return `[${this.options.prefix}] ${pid}  - `;
  }

  /**
   * 格式化日志上下文，形如 "[ContextName] "（彩色模式下为黄色）
   *
   * @param context 上下文名称
   * @returns 格式化后的上下文字符串（为空时返回空字符串）
   */
  protected formatContext(context: string): string {
    if (!context) {
      return '';
    }

    context = `[${context}] `;
    return this.options.colors ? yellow(context) : context;
  }

  /**
   * 将 PID 前缀、时间戳、级别、上下文、消息与时间戳差值
   * 拼装为一行完整的文本日志
   *
   * @param logLevel 日志级别
   * @param message 日志消息
   * @param pidMessage PID 前缀
   * @param formattedLogLevel 格式化后的级别字符串
   * @param contextMessage 上下文前缀
   * @param timestampDiff 时间戳差值字符串
   * @returns 一行完整的日志文本
   */
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

  /**
   * 将消息字符串化：函数会被求值、类会显示其名称，
   * 对象/数组用 util.inspect 检查并附带类型与长度前缀，
   * 字符串按级别着色
   *
   * @param message 待字符串化的消息
   * @param logLevel 日志级别（用于着色）
   * @returns 字符串化后的消息文本
   */
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

  /**
   * 按日志级别为消息着色（JSON 模式或未启用彩色时原样返回）
   *
   * @param message 消息文本
   * @param logLevel 日志级别
   * @returns 着色后的消息文本
   */
  protected colorize(message: string, logLevel: LogLevel) {
    if (!this.options.colors || this.options.json) {
      return message;
    }
    const color = this.getColorByLogLevel(logLevel);
    return color(message);
  }

  /**
   * 将错误堆栈打印到 stderr（JSON 模式下跳过，堆栈已包含在日志对象中）
   *
   * @param stack 错误堆栈字符串
   */
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

  /**
   * 计算并返回与上一条日志的时间差（开启 `timestamp` 选项时），
   * 同时更新"上一条日志时间"记录
   *
   * @returns 形如 " +123ms" 的时间差字符串（未启用时为空字符串）
   */
  protected updateAndGetTimestampDiff(): string {
    const includeTimestamp =
      ConsoleLogger.lastTimestampAt && this.options?.timestamp;
    const result = includeTimestamp
      ? this.formatTimestampDiff(Date.now() - ConsoleLogger.lastTimestampAt!)
      : '';
    ConsoleLogger.lastTimestampAt = Date.now();
    return result;
  }

  /**
   * 格式化时间差字符串（彩色模式下为黄色）
   *
   * @param timestampDiff 时间差（毫秒）
   * @returns 形如 " +123ms" 的字符串
   */
  protected formatTimestampDiff(timestampDiff: number) {
    const formattedDiff = ` +${timestampDiff}ms`;
    return this.options.colors ? yellow(formattedDiff) : formattedDiff;
  }

  /**
   * 根据配置项构造传给 util.inspect 的检查选项
   * （深度、排序、紧凑模式、换行长度、最大长度等）
   *
   * @returns InspectOptions 对象
   */
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

  /**
   * JSON.stringify 的替换器：模仿 util.inspect 的行为，
   * 将 bigint/symbol 转为字符串，Map/Set/Error 用 inspect 输出
   *
   * @param key 当前属性键
   * @param value 当前属性值
   * @returns 替换后的值
   */
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

  /**
   * 从日志参数中分离出消息列表与上下文名称
   * （约定：最后一个字符串参数视为上下文）
   *
   * @param args 原始日志参数
   * @returns 消息列表与上下文
   */
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

  /**
   * 从日志参数中分离出消息列表、上下文名称与错误堆栈
   * （error 级别专用：最后一个符合堆栈格式的字符串参数视为堆栈）
   *
   * @param args 原始日志参数
   * @returns 消息列表、上下文与堆栈
   */
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

  /**
   * 判断字符串是否符合错误堆栈的格式（含 "at file:line:column" 行）
   *
   * @param stack 待检查的字符串
   * @returns 符合堆栈格式则返回 `true`
   */
  protected isStackFormat(stack: unknown) {
    if (!isString(stack) && !isUndefined(stack)) {
      return false;
    }

    return /^(.)+\n\s+at .+:\d+:\d+/.test(stack!);
  }

  /**
   * 获取指定日志级别对应的终端颜色
   * （debug-品红、warn-黄、error-红、verbose-青、fatal-加粗、其余绿色）
   *
   * @param level 日志级别
   * @returns 对应的颜色函数
   */
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
