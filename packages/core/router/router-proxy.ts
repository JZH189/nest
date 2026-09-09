import { ExceptionsHandler } from '../exceptions/exceptions-handler';
import { ExecutionContextHost } from '../helpers/execution-context-host';

/**
 * 路由代理回调的类型定义。
 *
 * 描述被代理的目标处理函数的签名：接收请求、响应和 next 回调，
 * 可以是同步或异步（Promise）形式。
 */
export type RouterProxyCallback = <TRequest, TResponse>(
  req: TRequest,
  res: TResponse,
  next: () => void,
) => void | Promise<void>;

/**
 * 路由代理，负责把异常路由到异常过滤器。
 *
 * 在框架中的角色：RouterProxy 用高阶函数把真正的路由处理器（控制器方法或中间层回调）
 * 包裹起来。当目标回调抛出异常时，代理不会让异常直接冒泡到 HTTP 服务器，
 * 而是构造 ExecutionContextHost 参数宿主，交由 ExceptionsHandler（内部持有
 * 已注册的异常过滤器链）统一处理，从而实现 @Catch 异常过滤器的捕获逻辑。
 */
export class RouterProxy {
  /**
   * 创建一个普通路由代理：包裹目标回调并在异常发生时转发给异常处理器。
   *
   * @param targetCallback - 被包裹的原始路由处理回调（如调用控制器方法的函数）。
   * @param exceptionsHandler - 异常处理器，内部持有异常过滤器链。
   * @returns 返回新的异步回调，正常时执行原逻辑，异常时交给 exceptionsHandler 处理。
   */
  public createProxy(
    targetCallback: RouterProxyCallback,
    exceptionsHandler: ExceptionsHandler,
  ) {
    return async <TRequest, TResponse>(
      req: TRequest,
      res: TResponse,
      next: () => void,
    ) => {
      try {
        // 执行被代理的原始回调（控制器方法调用 + 拦截器管道等）
        await targetCallback(req, res, next);
      } catch (e) {
        // 1. 用 [req, res, next] 构造执行上下文宿主，供过滤器获取请求/响应等对象
        const host = new ExecutionContextHost([req, res, next]);
        // 2. 将异常交给异常处理器，由匹配的异常过滤器生成响应
        exceptionsHandler.next(e, host);
        // 3. 返回响应对象，阻止异常继续向上抛出
        return res;
      }
    };
  }

  /**
   * 创建一个"异常层"代理：包裹的回调本身已接收 err 参数（即处于异常处理链中），
   * 若该回调在处理异常的过程中又抛出了新异常，则同样转交异常处理器兜底。
   *
   * 典型场景：包裹 ExceptionsHandler 自身，防止异常过滤器内部抛错导致进程崩溃。
   *
   * @param targetCallback - 接收 err 参数的目标回调。
   * @param exceptionsHandler - 异常处理器。
   * @returns 返回新的异步回调，执行失败时将新异常交给 exceptionsHandler 处理。
   */
  public createExceptionLayerProxy(
    targetCallback: <TError, TRequest, TResponse>(
      err: TError,
      req: TRequest,
      res: TResponse,
      next: () => void,
    ) => void | Promise<void>,
    exceptionsHandler: ExceptionsHandler,
  ) {
    return async <TError, TRequest, TResponse>(
      err: TError,
      req: TRequest,
      res: TResponse,
      next: () => void,
    ) => {
      try {
        await targetCallback(err, req, res, next);
      } catch (e) {
        const host = new ExecutionContextHost([req, res, next]);
        exceptionsHandler.next(e, host);
        return res;
      }
    };
  }
}
