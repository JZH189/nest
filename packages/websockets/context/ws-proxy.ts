import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { EMPTY, isObservable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { WsExceptionsHandler } from '../exceptions/ws-exceptions-handler';

/**
 * WebSocket 代理（WsProxy）：将目标回调包装为“带异常捕获”的代理函数。
 *
 * HTTP 侧对应的是 RouterProxy；这里同步异常与 Promise 拒绝、以及
 * Observable 内部的错误流都会被捕获并交给 WsExceptionsHandler 处理，
 * 避免单个消息处理失败导致整个 socket 崩溃。
 */
export class WsProxy {
  /**
   * 创建代理回调。
   *
   * 处理步骤：
   * 1. 将消息模式（targetPattern，缺失时为 'unknown'）追加到参数尾部，
   *    作为 ExecutionContextHost 的第三个上下文元素；
   * 2. 执行目标回调：若返回值是 Observable，则通过 catchError 捕获流内错误
   *    并交给异常处理器（返回 EMPTY 终止流）；
   * 3. 同步/异步抛出的异常同样交给异常处理器（由其决定是否回传错误消息）。
   *
   * @param targetCallback - 被代理的目标回调（含守卫/拦截器/管道链）。
   * @param exceptionsHandler - WebSocket 异常处理器。
   * @param targetPattern - 订阅的消息模式（消息名）。
   * @returns 包装后的异步代理函数。
   */
  public create(
    targetCallback: (...args: unknown[]) => Promise<any>,
    exceptionsHandler: WsExceptionsHandler,
    targetPattern?: string,
  ): (...args: unknown[]) => Promise<any> {
    return async (...args: unknown[]) => {
      args = [...args, targetPattern ?? 'unknown'];
      try {
        const result = await targetCallback(...args);
        return !isObservable(result)
          ? result
          : result.pipe(
              catchError(error => {
                this.handleError(exceptionsHandler, args, error);
                return EMPTY;
              }),
            );
      } catch (error) {
        this.handleError(exceptionsHandler, args, error);
      }
    };
  }

  /**
   * 构造 'ws' 类型的 ExecutionContextHost 并将异常交给异常处理器。
   *
   * @param exceptionsHandler - WebSocket 异常处理器。
   * @param args - 当前调用的运行时参数（[client, data, ack?, pattern]）。
   * @param error - 捕获到的异常对象。
   * @returns 无返回值。
   */
  handleError<T>(
    exceptionsHandler: WsExceptionsHandler,
    args: unknown[],
    error: T,
  ) {
    const host = new ExecutionContextHost(args);
    host.setType('ws');
    exceptionsHandler.handle(error as Error, host);
  }
}
