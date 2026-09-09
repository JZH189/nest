import type { Type } from '@nestjs/common';
import { ReplFunction } from '../repl-function';
import type { ReplFnDefinition } from '../repl.interfaces';

/**
 * REPL 原生函数 `resolve`：解析（resolve）请求作用域（request-scoped）
 * 或瞬态（transient）的注入实例，每次调用都会创建新实例；
 * 获取单例请使用 `get`。token 不存在时抛出异常。
 */
export class ResolveReplFn extends ReplFunction {
  public fnDefinition: ReplFnDefinition = {
    name: 'resolve',
    description:
      'Resolves transient or request-scoped instance of either injectable or controller, otherwise, throws exception.',
    signature: '(token: InjectionToken, contextId: any) => Promise<any>',
  };

  /**
   * 解析请求作用域/瞬态实例（等价于 app.resolve，返回 Promise）。
   *
   * @param token - 注入 token，可以是类、字符串或 symbol。
   * @param contextId - 请求上下文标识（用于请求作用域的子树解析），可选。
   * @returns 以解析出的实例兑现的 Promise。
   */
  action(
    token: string | symbol | Function | Type<any>,
    contextId: any,
  ): Promise<any> {
    return this.ctx.app.resolve(token, contextId);
  }
}
