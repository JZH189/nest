import { ForwardReference } from '../interfaces/modules/forward-reference.interface';

/**
 * 创建一个"前向引用"（Forward Reference）包装对象，
 * 用于解决模块/提供者之间的循环依赖问题。
 *
 * 当两个模块相互引用时，其中一个在编译期可能尚未定义，
 * 此时可将引用包在 forwardRef(() => ModuleClass) 中延迟求值，
 * 由 Nest 容器在运行期解析。
 *
 * @publicApi
 *
 * @param fn 返回被引用类型（通常是类）的惰性求值函数
 * @returns 一个包含 forwardRef 属性的 ForwardReference 对象
 */
export const forwardRef = (fn: () => any): ForwardReference => ({
  forwardRef: fn,
});
