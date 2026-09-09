import type { Type } from '@nestjs/common';
import { ReplFunction } from '../repl-function';
import type { ReplFnDefinition } from '../repl.interfaces';

/**
 * REPL 原生函数 `get`（别名 `$`）：根据注入 token 从应用容器中
 * 获取一个单例（可注入对象或控制器）实例，找不到时抛出异常。
 *
 * 在 REPL 中可用 `get(UserService)` 或 `$('UserService')` 调用，
 * 返回的实例可直接调用其方法进行交互式调试。
 */
export class GetReplFn extends ReplFunction {
  public fnDefinition: ReplFnDefinition = {
    name: 'get',
    signature: '(token: InjectionToken) => any',
    description:
      'Retrieves an instance of either injectable or controller, otherwise, throws exception.',
    aliases: ['$'],
  };

  /**
   * 根据注入 token 获取容器中的实例（等价于 app.get）。
   *
   * @param token - 注入 token，可以是类、字符串或 symbol。
   * @returns 对应的可注入/控制器实例；token 未注册时抛出异常。
   */
  action(token: string | symbol | Function | Type<any>): any {
    return this.ctx.app.get(token);
  }
}
