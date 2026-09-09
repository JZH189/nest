import { Type } from '@nestjs/common';

/**
 * "预览阶段初始化"（initialize-on-preview）白名单。
 *
 * 记录允许在部分图预览（partial graph preview）流程中被提前初始化的类型。
 * 当应用因依赖解析失败而进入部分图模式时，框架仅对白名单中的类型
 * 执行提前实例化，以保证预览输出可用。
 */
export class InitializeOnPreviewAllowlist {
  /** 类型 -> 是否在白名单中的弱引用映射，避免阻止类型的垃圾回收。 */
  private static readonly allowlist = new WeakMap<Type, boolean>();

  /**
   * 将一个类型加入白名单。
   *
   * @param type - 允许在预览阶段初始化的类类型。
   */
  public static add(type: Type) {
    this.allowlist.set(type, true);
  }

  /**
   * 判断某个类型是否在白名单中。
   *
   * @param type - 待检查的类类型。
   * @returns 在白名单中返回 true，否则返回 false。
   */
  public static has(type: Type) {
    return this.allowlist.has(type);
  }
}
