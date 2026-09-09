import { NestInterceptor, Type } from '@nestjs/common';
import {
  CallHandler,
  ContextType,
  Controller,
} from '@nestjs/common/interfaces';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { AsyncResource } from 'async_hooks';
import { Observable, defer, from as fromPromise } from 'rxjs';
import { mergeAll, switchMap } from 'rxjs/operators';
import { ExecutionContextHost } from '../helpers/execution-context-host';

/**
 * 拦截器消费器（Interceptors Consumer）：真正"执行"拦截器链的组件。
 *
 * 在框架中的角色：路由处理器被调用前，由 RouterProxy 等调用本类的
 * intercept 方法，把 handler 与全局/类级/方法级拦截器串联成一条
 * RxJS 风格的可组合链。拦截器在守卫（Guards）之后、管道（Pipes）
 * 之前执行，并可在调用 next() 前后转换请求参数与响应流。
 */
export class InterceptorsConsumer {
  /**
   * 依次执行拦截器链，最终调用真正的处理器（next）。
   *
   * @param interceptors - 按顺序排列的拦截器实例数组。
   * @param args - 传给处理器的参数（请求、响应等，因上下文类型而异）。
   * @param instance - 处理器所属的 controller 实例。
   * @param callback - 原始的处理器方法。
   * @param next - 调用真正的处理器（含管道与处理器本身）的函数。
   * @param type - 执行上下文类型（'http'、'ws'、'rpc' 等）。
   * @returns 处理器结果（通常为 Observable 或其解包后的值）。
   */
  public async intercept<TContext extends string = ContextType>(
    interceptors: NestInterceptor[],
    args: unknown[],
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
    next: () => Promise<unknown>,
    type?: TContext,
  ): Promise<unknown> {
    if (isEmpty(interceptors)) {
      // 1. 无拦截器时直接放行，避免额外开销
      return next();
    }
    // 2. 构造执行上下文并设置上下文类型
    const context = this.createContext(args, instance, callback);
    context.setType<TContext>(type!);

    // 3. 递归构建拦截器链：每个拦截器的 handle() 会推迟到下一个拦截器，
    //    链尾则通过 transformDeferred 惰性触发真正的处理器
    const nextFn = async (i = 0) => {
      if (i >= interceptors.length) {
        return defer(AsyncResource.bind(() => this.transformDeferred(next)));
      }
      const handler: CallHandler = {
        handle: () =>
          defer(AsyncResource.bind(() => nextFn(i + 1))).pipe(mergeAll()),
      };
      return interceptors[i].intercept(context, handler);
    };
    return defer(() => nextFn()).pipe(mergeAll());
  }

  /**
   * 创建拦截器的执行上下文（ExecutionContextHost），
   * 供拦截器内部通过 switchToHttp() 等方法获取请求细节。
   *
   * @param args - 传给处理器的参数数组。
   * @param instance - 处理器所属的 controller 实例。
   * @param callback - 原始的处理器方法。
   * @returns 执行上下文宿主实例。
   */
  public createContext(
    args: unknown[],
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
  ): ExecutionContextHost {
    return new ExecutionContextHost(
      args,
      instance.constructor as Type<unknown>,
      callback,
    );
  }

  /**
   * 将"调用处理器"的 Promise 延迟包装为 Observable，并归一化其返回值：
   * 若处理器返回 Promise/Observable 则原样透传（交由后续操作符扁平化），
   * 否则包装为立即解析的值。
   *
   * @param next - 调用真正处理器的函数。
   * @returns 处理器结果的 Observable 流。
   */
  public transformDeferred(next: () => Promise<any>): Observable<any> {
    return fromPromise(next()).pipe(
      switchMap(res => {
        const isDeferred = res instanceof Promise || res instanceof Observable;
        return isDeferred ? res : Promise.resolve(res);
      }),
    );
  }
}
