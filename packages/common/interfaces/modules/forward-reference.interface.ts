/**
 * 前向引用，由 `forwardRef(() => SomeClass)` 创建。
 * 用于解决模块/提供者之间的循环依赖：引用被延迟到容器真正解析时再求值。
 */
export interface ForwardReference<T = any> {
  /** 被延迟求值的引用（通常是一个返回类型的工厂函数） */
  forwardRef: T;
}
