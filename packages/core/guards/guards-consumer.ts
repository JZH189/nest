import { CanActivate } from '@nestjs/common';
import { ContextType, Controller } from '@nestjs/common/interfaces';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { lastValueFrom, Observable } from 'rxjs';
import { ExecutionContextHost } from '../helpers/execution-context-host';

/**
 * 守卫消费者：负责在请求管道中实际执行守卫链。
 *
 * 在框架中的角色：路由代理（RouterProxy）包装的请求处理流程中，守卫在
 * 中间件之后、拦截器（含路由处理器）之前执行。本类按顺序逐个调用守卫的
 * canActivate()，任一守卫返回 false 即中止请求（由上层抛出
 * ForbiddenException，文案为 FORBIDDEN_MESSAGE）；全部通过才放行进入拦截器。
 *
 * 由 GuardsContextCreator 负责收集/解析守卫实例，本类只负责“执行”。
 */
export class GuardsConsumer {
  /**
   * 依次激活（执行）守卫链，判断请求是否被允许进入路由处理器。
   * @param guards - 已解析好的守卫实例数组（含全局与路由级守卫）
   * @param args - 路由参数数组（request、response、next 等，视上下文类型而定）
   * @param instance - 控制器实例
   * @param callback - 即将执行的路由处理方法
   * @param type - 上下文类型（'http'、'ws'、'rpc' 等）
   * @returns 所有守卫均放行返回 true；任一守卫拒绝返回 false
   */
  public async tryActivate<TContext extends string = ContextType>(
    guards: CanActivate[],
    args: unknown[],
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
    type?: TContext,
  ): Promise<boolean> {
    if (!guards || isEmpty(guards)) {
      return true;
    }
    // 为本次请求构造执行上下文，并标记上下文类型（http/ws/rpc）
    const context = this.createContext(args, instance, callback);
    context.setType<TContext>(type!);

    for (const guard of guards) {
      const result = guard.canActivate(context);
      if (typeof result === 'boolean') {
        // 同步结果：false 直接中止，true 继续下一个守卫
        if (!result) {
          return false;
        }
        continue;
      }
      // 异步结果（Promise 或 Observable）：等待结果后再判定
      if (await this.pickResult(result)) {
        continue;
      }
      return false;
    }
    return true;
  }

  /**
   * 基于路由参数创建 ExecutionContextHost，作为传给守卫的执行上下文。
   * @param args - 路由参数数组（request、response 等）
   * @param instance - 控制器实例（其构造函数作为类的引用）
   * @param callback - 路由处理方法
   * @returns 封装好的 ExecutionContextHost 实例
   */
  public createContext(
    args: unknown[],
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
  ): ExecutionContextHost {
    return new ExecutionContextHost(
      args,
      instance.constructor as any,
      callback,
    );
  }

  /**
   * 将守卫 canActivate 的返回值统一解析为 boolean。
   * @param result - 守卫返回的同步布尔值、Promise 或 Observable
   * @returns 解析后的布尔结果
   */
  public async pickResult(
    result: boolean | Promise<boolean> | Observable<boolean>,
  ): Promise<boolean> {
    if (result instanceof Observable) {
      // Observable 通过 lastValueFrom 取最后一个值
      return lastValueFrom(result);
    }
    return result;
  }
}
