import type { ReplContext } from './repl-context';
import type { ReplFunction } from './repl-function';

/**
 * REPL 原生函数的元信息定义，用于描述一个可在 REPL 中调用的函数，
 * 这些信息会展示在 `help` 命令输出和 `<fnName>.help` 帮助信息中。
 */
export type ReplFnDefinition = {
  /** Function's name. Note that this should be a valid JavaScript function name. */
  name: string;

  /** Alternative names to the function. */
  aliases?: ReplFnDefinition['name'][];

  /** Function's description to display when `<function>.help` is entered. */
  description: string;

  /**
   * Function's signature following TypeScript _function type expression_ syntax.
   * @example '(token: InjectionToken) => any'
   */
  signature: string;
};

/**
 * 原生函数类的构造器类型约定：任何可被 ReplContext 实例化注册的
 * ReplFunction 子类（含用户自定义扩展函数）都需满足此签名。
 */
export type ReplFunctionClass = new (replContext: ReplContext) => ReplFunction;
