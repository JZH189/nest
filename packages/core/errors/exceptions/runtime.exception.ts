/**
 * Nest 核心运行时异常基类，所有框架内部异常均继承自它。
 */
export class RuntimeException extends Error {
  constructor(message = ``) {
    super(message);
  }

  public what() {
    return this.message;
  }
}
