/**
 * 装饰器参数校验失败时抛出的异常。
 * 提供统一格式的错误消息："Invalid <item> passed to <decorator>() decorator (<context>)."
 */
export class InvalidDecoratorItemException extends Error {
  private readonly msg: string;

  /**
   * @param decorator 校验失败的装饰器名称（如 "Module"）
   * @param item 不合法的条目描述（如 "property"）
   * @param context 出错时的上下文（通常是宿主类的名称）
   */
  constructor(decorator: string, item: string, context: string) {
    const message = `Invalid ${item} passed to ${decorator}() decorator (${context}).`;
    super(message);

    this.msg = message;
  }

  /**
   * @returns 格式化的错误消息文本
   */
  public what(): string {
    return this.msg;
  }
}

/**
 * 校验装饰器接收的数组参数中的每一项是否都满足断言条件。
 * 只要有一项不满足，就抛出 "InvalidDecoratorItemException"。
 * 被 @Module 等装饰器内部使用，用于在编译期尽早发现非法的装饰器参数。
 *
 * @param context 宿主上下文对象（其 name 属性为宿主类名，用于错误提示）
 * @param arr 待校验的数组
 * @param predicate 对每项执行的断言函数，返回 falsy 表示该项非法
 * @param decorator 装饰器名称（用于错误消息）
 * @param item 非法条目的描述（用于错误消息）
 * @returns 校验通过返回 `true`；校验失败则直接抛出异常
 */
export function validateEach(
  context: { name: string },
  arr: any[],
  predicate: Function,
  decorator: string,
  item: string,
): boolean {
  if (!context || !context.name) {
    return true;
  }
  const errors = arr.some(str => !predicate(str));
  if (errors) {
    throw new InvalidDecoratorItemException(decorator, item, context.name);
  }
  return true;
}
