import { Observable } from 'rxjs';
import { ExecutionContext } from './execution-context.interface';

/**
 * 定义守卫必须实现的 `canActivate()` 函数的接口。
 * 返回值指示当前请求是否被允许继续。返回值可以是同步的（`boolean`）
 * 或异步的（`Promise` 或 `Observable`）。
 *
 * @see [守卫](https://docs.nestjs.cn/guards)
 *
 * @publicApi
 */
export interface CanActivate {
  /**
   * @param context 当前执行上下文。提供对当前请求管道详情的访问。
   *
   * @returns 指示当前请求是否被允许继续的值。
   */
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean>;
}
