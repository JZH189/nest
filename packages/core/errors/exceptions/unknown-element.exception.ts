import { RuntimeException } from './runtime.exception';

/**
 * 在当前上下文中找不到给定的 provider/元素（如 get/resolve 未知 token）时抛出。
 */
export class UnknownElementException extends RuntimeException {
  constructor(name?: string | symbol) {
    name = name && name.toString();
    super(
      `Nest could not find ${
        name || 'given'
      } element (this provider does not exist in the current context)`,
    );
  }
}
