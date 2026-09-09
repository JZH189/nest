import { RuntimeException } from './runtime.exception';

/**
 * 通过 select() 选择一个在当前上下文中不存在的模块时抛出。
 */
export class UnknownModuleException extends RuntimeException {
  constructor(moduleName?: string) {
    super(
      `Nest could not select the given module (${
        moduleName ? `"${moduleName}"` : 'it'
      } does not exist in current context).`,
    );
  }
}
