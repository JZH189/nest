/**
 * 确定性 UUID 注册表：为字符串生成确定性的（可复现的）哈希 id，
 * 并保证同一轮图构建过程中生成的 id 不重复（冲突时追加自增后缀重试）。
 *
 * 在框架中的角色：GraphInspector 为图的节点/边生成稳定 id 时使用，
 * 使得相同输入总能得到相同 id，便于图的 diff 与复现。
 */
export class DeterministicUuidRegistry {
  /** 已分配 id 的注册表（id -> true），用于查重。 */
  private static readonly registry = new Map<string, boolean>();

  /**
   * 根据字符串获取一个确定性的、未冲突的 id。
   *
   * @param str - 用于生成 id 的原始字符串（如节点标签）。
   * @param inc - 冲突重试计数，内部递归使用。
   * @returns 唯一的字符串形式哈希 id。
   */
  static get(str: string, inc = 0) {
    const id = inc ? this.hashCode(`${str}_${inc}`) : this.hashCode(str);
    if (this.registry.has(id)) {
      return this.get(str, inc + 1);
    }
    this.registry.set(id, true);
    return id;
  }

  /**
   * 清空注册表。每轮图构建（inspectModules）结束后调用，
   * 以释放内存并允许重新生成 id。
   */
  static clear() {
    this.registry.clear();
  }

  /**
   * 计算字符串的 31 进制滚动哈希（Java 风格 hashCode），
   * 使用 Math.imul 保证 32 位整数溢出行为一致。
   *
   * @param s - 待哈希的字符串。
   * @returns 哈希值的十进制字符串形式。
   */
  private static hashCode(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++)
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h.toString();
  }
}
