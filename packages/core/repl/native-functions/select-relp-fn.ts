import type {
  DynamicModule,
  INestApplicationContext,
  Type,
} from '@nestjs/common';
import { ReplFunction } from '../repl-function';
import type { ReplFnDefinition } from '../repl.interfaces';

/**
 * REPL 原生函数 `select`：在模块树中导航，从当前应用上下文中
 * 选出（select）某个模块的子上下文，返回该模块的
 * INestApplicationContext，随后可在返回的上下文上继续调用
 * get/resolve 等方法获取该模块内部的实例。
 */
export class SelectReplFn extends ReplFunction {
  public fnDefinition: ReplFnDefinition = {
    name: 'select',
    description:
      'Allows navigating through the modules tree, for example, to pull out a specific instance from the selected module.',
    signature: '(token: DynamicModule | ClassRef) => INestApplicationContext',
  };

  /**
   * 选择指定模块并返回其子上下文（等价于 app.select）。
   *
   * @param token - 目标模块类或动态模块定义。
   * @returns 该模块对应的独立应用上下文。
   */
  action(token: DynamicModule | Type<unknown>): INestApplicationContext {
    return this.ctx.app.select(token);
  }
}
