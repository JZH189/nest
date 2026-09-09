import {
  ArgumentsHost,
  IntrinsicException,
  Logger,
  WsExceptionFilter,
} from '@nestjs/common';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { MESSAGES } from '@nestjs/core/constants';
import { WsException } from '../errors/ws-exception';

/**
 * 错误负载：异常发生时通过 'exception' 事件回传给客户端的消息结构。
 */
export interface ErrorPayload<Cause = { pattern: string; data: unknown }> {
  /**
   * Error message identifier.
   */
  status: 'error';
  /**
   * Error message.
   */
  message: string;
  /**
   * Message that caused the exception.
   */
  cause?: Cause;
}

/** 异常过滤器选项。 */
interface BaseWsExceptionFilterOptions {
  /**
   * When true, the data that caused the exception will be included in the response.
   * This is useful when you want to provide additional context to the client, or
   * when you need to associate the error with a specific request.
   * @default true
   */
  includeCause?: boolean;

  /**
   * A factory function that can be used to control the shape of the "cause" object.
   * This is useful when you need a custom structure for the cause object.
   * @default (pattern, data) => ({ pattern, data })
   */
  causeFactory?: (pattern: string, data: unknown) => Record<string, any>;
}

/**
 * WebSocket 异常过滤器基类：默认的异常处理实现。
 *
 * 捕获处理链中抛出的异常后，通过客户端 socket 的 'exception' 事件
 * 将错误负载回传给客户端；未被识别的异常只回传通用错误消息并记录日志，
 * 避免泄露内部细节。
 *
 * @typeParam TError - 捕获的异常类型。
 * @publicApi
 */
export class BaseWsExceptionFilter<
  TError = any,
> implements WsExceptionFilter<TError> {
  protected static readonly logger = new Logger('WsExceptionsHandler');

  /**
   * @param options - 过滤器选项（includeCause 是否附带出错消息、causeFactory 自定义 cause 结构）。
   */
  constructor(protected readonly options: BaseWsExceptionFilterOptions = {}) {
    // 为选项填充默认值：默认附带 cause，cause 结构为 { pattern, data }。
    this.options.includeCause = this.options.includeCause ?? true;
    this.options.causeFactory =
      this.options.causeFactory ?? ((pattern, data) => ({ pattern, data }));
  }

  /**
   * 异常过滤器入口：从执行上下文中提取客户端、消息模式与消息数据后交给 handleError。
   *
   * @param exception - 捕获到的异常。
   * @param host - 执行上下文宿主（ArgumentsHost）。
   * @returns 无返回值。
   */
  public catch(exception: TError, host: ArgumentsHost) {
    // 1. 从 ws 上下文中取出客户端 socket、消息模式、触发异常的消息数据。
    const client = host.switchToWs().getClient();
    const pattern = host.switchToWs().getPattern();
    const data = host.switchToWs().getData();
    this.handleError(client, exception, {
      pattern,
      data,
    });
  }

  /**
   * 处理异常并决定回传给客户端的负载。
   *
   * 处理步骤：
   * 1. 非 WsException 的异常转交给 handleUnknownError；
   * 2. WsException 携带对象错误时，将对象原样通过 'exception' 事件回传；
   * 3. 携带字符串错误时构造 { status: 'error', message } 负载；
   * 4. 若 includeCause 开启，则用 causeFactory 构造 cause 附加到负载中后回传。
   *
   * @param client - 客户端 socket（需具备 emit 方法）。
   * @param exception - 捕获到的异常。
   * @param cause - 导致异常的消息上下文（pattern 与 data）。
   * @returns 无返回值。
   */
  public handleError<TClient extends { emit: Function }>(
    client: TClient,
    exception: TError,
    cause: ErrorPayload['cause'],
  ) {
    if (!(exception instanceof WsException)) {
      return this.handleUnknownError(exception, client, cause);
    }

    const status = 'error';
    const result = exception.getError();

    if (isObject(result)) {
      return client.emit('exception', result);
    }

    const payload: ErrorPayload<unknown> = {
      status,
      message: result,
    };

    if (this.options?.includeCause && cause) {
      payload.cause = this.options.causeFactory!(cause.pattern, cause.data);
    }

    client.emit('exception', payload);
  }

  /**
   * 处理未知类型异常：只回传通用错误消息（不暴露细节），并记录错误日志。
   *
   * 处理步骤：
   * 1. 构造含 UNKNOWN_EXCEPTION_MESSAGE 的错误负载，按需附加 cause 后回传；
   * 2. 若异常不是内部固有异常（IntrinsicException），用 logger.error 记录。
   *
   * @param exception - 捕获到的异常。
   * @param client - 客户端 socket。
   * @param data - 导致异常的消息上下文。
   * @returns 无返回值。
   */
  public handleUnknownError<TClient extends { emit: Function }>(
    exception: TError,
    client: TClient,
    data: ErrorPayload['cause'],
  ) {
    const status = 'error';
    const payload: ErrorPayload<unknown> = {
      status,
      message: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
    };

    if (this.options?.includeCause && data) {
      payload.cause = this.options.causeFactory!(data.pattern, data.data);
    }

    client.emit('exception', payload);

    if (!(exception instanceof IntrinsicException)) {
      const logger = BaseWsExceptionFilter.logger;
      logger.error(exception);
    }
  }

  /**
   * 判断给定值是否为可识别的异常对象（含 message 字段的对象）。
   *
   * @param err - 待判断的值。
   * @returns 是否为 Error 形态的对象。
   */
  public isExceptionObject(err: any): err is Error {
    return isObject(err) && !!(err as Error).message;
  }
}
