import type { Type, InjectionToken } from '@nestjs/common';
import { clc } from '@nestjs/common/utils/cli-colors.util';
import { ReplFunction } from '../repl-function';
import type { ModuleDebugEntry } from '../repl-context';
import type { ReplFnDefinition } from '../repl.interfaces';

/**
 * REPL 原生函数 `debug`：以列表形式打印容器中所有已注册模块
 * 及其各自的 controllers 和 providers（数据来自 ReplContext.debugRegistry）。
 * 传入模块类或模块名时可只打印该模块的内容，便于定位问题。
 */
export class DebugReplFn extends ReplFunction {
  public fnDefinition: ReplFnDefinition = {
    name: 'debug',
    description:
      'Print all registered modules as a list together with their controllers and providers.\nIf the argument is passed in, for example, "debug(MyModule)" then it will only print components of this specific module.',
    signature: '(moduleCls?: ClassRef | string) => void',
  };

  /**
   * 打印模块的调试信息：不传参数时打印全部模块，传入模块类或名称时只打印该模块。
   *
   * @param moduleCls - 可选的目标模块类或模块名称字符串。
   */
  action(moduleCls?: Type<unknown> | string): void {
    this.ctx.writeToStdout('\n');

    if (moduleCls) {
      // 1. 将类统一转为类名，再到 debugRegistry 中查找对应条目
      const token =
        typeof moduleCls === 'function' ? moduleCls.name : moduleCls;
      const moduleEntry = this.ctx.debugRegistry[token];
      if (!moduleEntry) {
        return this.logger.error(
          `"${token}" has not been found in the modules registry`,
        );
      }
      // 2. 只打印指定模块的 controllers/providers
      this.printCtrlsAndProviders(token, moduleEntry);
    } else {
      // 3. 未指定模块时遍历打印全部模块
      Object.keys(this.ctx.debugRegistry).forEach(moduleKey => {
        this.printCtrlsAndProviders(
          moduleKey,
          this.ctx.debugRegistry[moduleKey],
        );
      });
    }
    this.ctx.writeToStdout('\n');
  }

  /** 打印某个模块标题及其 controllers、providers 两个集合 */
  private printCtrlsAndProviders(
    moduleName: string,
    moduleDebugEntry: ModuleDebugEntry,
  ) {
    this.ctx.writeToStdout(`${clc.green(moduleName)}:\n`);
    this.printCollection('controllers', moduleDebugEntry['controllers']);
    this.printCollection('providers', moduleDebugEntry['providers']);
  }

  /** 逐行打印集合中的每个条目名称；集合为空则跳过 */
  private printCollection(
    title: string,
    collectionValue: Record<string, InjectionToken>,
  ) {
    const collectionEntries = Object.keys(collectionValue);
    if (collectionEntries.length <= 0) {
      return;
    }

    this.ctx.writeToStdout(` ${clc.yellow(`- ${title}`)}:\n`);
    collectionEntries.forEach(provider =>
      this.ctx.writeToStdout(`  ${clc.green('◻')} ${provider}\n`),
    );
  }
}
