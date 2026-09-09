import { Logger } from '@nestjs/common';
import { clc } from '@nestjs/common/utils/cli-colors.util';
import { ReplContext } from './repl-context';
import type { ReplFnDefinition } from './repl.interfaces';

/**
 * 所有 REPL 原生函数的抽象基类。
 *
 * 每个原生函数（如 get、resolve、select、debug 等）都继承此类，
 * 通过 `fnDefinition` 描述函数的元信息（名称、签名、描述、别名），
 * 并在 `action` 方法中实现用户在 REPL 中调用该函数时执行的具体逻辑。
 * 子类还可以通过 ReplContext 扩展注册，成为 REPL 中的可用命令。
 *
 * @typeParam ActionParams - action 方法的参数列表类型。
 * @typeParam ActionReturn - action 方法的返回值类型。
 */
export abstract class ReplFunction<
  ActionParams extends Array<unknown> = Array<unknown>,
  ActionReturn = any,
> {
  /** Metadata that describes the built-in function itself. */
  public abstract fnDefinition: ReplFnDefinition;

  protected readonly logger: Logger;

  /**
   * @param ctx - REPL 上下文，提供应用实例与输出工具，子类通过它访问容器。
   */
  constructor(protected readonly ctx: ReplContext) {
    this.logger = ctx.logger;
  }

  /**
   * Method called when the function is invoked from the REPL by the user.
   */
  abstract action(...args: ActionParams): ActionReturn;

  /**
   * 生成该函数的帮助信息文本（在 REPL 中输入 `<函数名>.help` 时展示），
   * 内容由函数描述与 TypeScript 函数签名组成，并带有终端着色。
   *
   * @returns 格式化后的帮助信息字符串。
   */
  public makeHelpMessage(): string {
    const { description, name, signature } = this.fnDefinition;

    const fnSignatureWithName = `${name}${signature}`;

    return `${clc.yellow(description)}\n${clc.magentaBright(
      'Interface:',
    )} ${clc.bold(fnSignatureWithName)}\n`;
  }
}
