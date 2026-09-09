import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { isObservable, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RpcExceptionsHandler } from '../exceptions/rpc-exceptions-handler';

/**
 * RPC 代理工厂：为消息处理器创建统一的调用代理。
 * 在目标回调（Guard -> 拦截器 -> 方法调用的组合逻辑）外层套上异常过滤器：
 * 调用过程或结果 Observable 中抛出的异常都会交给 RpcExceptionsHandler 处理。
 */
export class RpcProxy {
  /**
   * 创建带异常处理的代理函数。
   * @param targetCallback - 实际的调用链（返回 Observable）
   * @param exceptionsHandler - RPC 异常处理器
   * @returns 包装后的处理器代理函数
   */
  public create(
    targetCallback: (...args: unknown[]) => Promise<Observable<any>>,
    exceptionsHandler: RpcExceptionsHandler,
  ): (...args: unknown[]) => Promise<Observable<unknown>> {
    return async (...args: unknown[]) => {
      try {
        const result = await targetCallback(...args);
        return !isObservable(result)
          ? result
          : result.pipe(
              catchError(error =>
                this.handleError(exceptionsHandler, args, error),
              ),
            );
      } catch (error) {
        return this.handleError(exceptionsHandler, args, error);
      }
    };
  }

  /**
   * 用当前参数构造 ExecutionContextHost（type = 'rpc'）并交给异常处理器处理。
   * @param exceptionsHandler - RPC 异常处理器
   * @param args - 原始调用参数
   * @param error - 捕获到的异常
   * @returns 异常处理器返回的 Observable
   */
  handleError<T>(
    exceptionsHandler: RpcExceptionsHandler,
    args: unknown[],
    error: T,
  ): Observable<unknown> {
    const host = new ExecutionContextHost(args);
    host.setType('rpc');
    return exceptionsHandler.handle(error as Error, host);
  }
}
