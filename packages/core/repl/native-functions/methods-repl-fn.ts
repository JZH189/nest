import type { Type } from '@nestjs/common';
import { clc } from '@nestjs/common/utils/cli-colors.util';
import { MetadataScanner } from '../../metadata-scanner';
import { ReplFunction } from '../repl-function';
import type { ReplFnDefinition } from '../repl.interfaces';

/**
 * REPL 原生函数 `methods`：打印给定提供者（provider）或控制器
 * （controller）上所有可用的公共方法名称，便于在 REPL 中
 * 快速了解某个实例暴露了哪些可调用的方法。
 */
export class MethodsReplFn extends ReplFunction {
  public fnDefinition: ReplFnDefinition = {
    name: 'methods',
    description:
      'Display all public methods available on a given provider or controller.',
    signature: '(token: ClassRef | string) => void',
  };

  private readonly metadataScanner = new MetadataScanner();

  /**
   * 打印指定实例（或类）原型上的全部公共方法名。
   *
   * @param token - 目标的类引用，或可通过 app.get 解析实例的注入 token。
   */
  action(token: Type<unknown> | string): void {
    // 1. 确定方法扫描的原型对象：传入类时取其 prototype，否则先 get 出实例再取其原型
    const proto =
      typeof token !== 'function'
        ? Object.getPrototypeOf(this.ctx.app.get(token))
        : token?.prototype;

    // 2. 使用元数据扫描器收集原型上的方法名（含继承链上的方法）
    const methods = this.metadataScanner.getAllMethodNames(proto);

    this.ctx.writeToStdout('\n');
    this.ctx.writeToStdout(`${clc.green('Methods')}:\n`);
    methods.forEach(methodName =>
      this.ctx.writeToStdout(` ${clc.yellow('◻')} ${methodName}\n`),
    );
    this.ctx.writeToStdout('\n');
  }
}
