import { ContextType } from '@nestjs/common/interfaces';
import { ExternalExceptionsHandler } from '../exceptions/external-exceptions-handler';
import { ExecutionContextHost } from '../helpers/execution-context-host';

/**
 * 外部错误代理：把目标回调包装成“异常感知”的代理函数。
 *
 * 在框架中的角色：ExternalContextCreator 在启用 filters 选项时，用本代理
 * 包裹外部处理器（微服务/WS/GraphQL 等）。回调抛出的异常会被转发给
 * ExternalExceptionsHandler.next()，由自定义过滤器或兜底过滤器处理，
 * 避免异常直接穿透到传输层。
 */
export class ExternalErrorProxy {
  /**
   * 创建代理函数：正常时透传结果，异常时交给异常处理器。
   * @param targetCallback - 被代理的目标回调
   * @param exceptionsHandler - 外部异常处理器实例
   * @param type - 上下文类型（'http'、'ws'、'rpc' 等）
   * @returns 包装后的异步代理函数
   */
  public createProxy<TContext extends string = ContextType>(
    targetCallback: (...args: any[]) => any,
    exceptionsHandler: ExternalExceptionsHandler,
    type?: TContext,
  ) {
    return async (...args: any[]) => {
      try {
        return await targetCallback(...args);
      } catch (e) {
        // 用当前调用参数构造执行上下文并标记类型，交由异常处理链处理
        const host = new ExecutionContextHost(args);
        host.setType<TContext>(type!);
        return exceptionsHandler.next(e, host);
      }
    };
  }
}
