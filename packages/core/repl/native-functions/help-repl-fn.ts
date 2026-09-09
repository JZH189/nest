import { iterate } from 'iterare';
import { clc } from '@nestjs/common/utils/cli-colors.util';
import { ReplFunction } from '../repl-function';
import type { ReplFnDefinition } from '../repl.interfaces';

/**
 * REPL 原生函数 `help`：列出当前 REPL 中所有可用的原生函数
 * （包括内置函数与用户自定义扩展函数），按名称排序输出，
 * 并提示用户可以对任意函数输入 `<函数名>.help` 查看详细帮助。
 */
export class HelpReplFn extends ReplFunction {
  public fnDefinition: ReplFnDefinition = {
    name: 'help',
    signature: '() => void',
    description: 'Display all available REPL native functions.',
  };

  /** 构造单个函数的帮助行：亮青色函数名 + 加粗破折号 + 描述 */
  static buildHelpMessage = ({ name, description }: ReplFnDefinition) =>
    clc.cyanBright(name) +
    (description ? ` ${clc.bold('-')} ${description}` : '');

  /**
   * 打印所有已注册原生函数的名称与描述（等价于在 REPL 中输入 `help()`）。
   */
  action(): void {
    // 1. 从上下文的 nativeFunctions 表中取出全部函数定义并按名称排序
    const sortedNativeFunctions = iterate(this.ctx.nativeFunctions)
      .map(([, nativeFunction]) => nativeFunction.fnDefinition)
      .toArray()
      .sort((a, b) => (a.name < b.name ? -1 : 1));

    this.ctx.writeToStdout(
      `You can call ${clc.bold(
        '.help',
      )} on any function listed below (e.g.: ${clc.bold('help.help')}):\n\n` +
        sortedNativeFunctions.map(HelpReplFn.buildHelpMessage).join('\n') +
        // Without the following LF the last item won't be displayed
        '\n',
    );
  }
}
