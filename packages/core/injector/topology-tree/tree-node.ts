/**
 * 通用树节点：持有节点值、子节点集合（Set 保证不重复）与父节点引用。
 * 提供挂载/摘除/重挂载、深度计算与环检测等能力，
 * 供 TopologyTree 在处理模块循环导入时使用。
 */
export class TreeNode<T> {
  /** 节点承载的值 */
  public readonly value: T;
  /** 子节点集合 */
  public readonly children = new Set<TreeNode<T>>();
  /** 父节点引用（根节点为 null） */
  private parent: TreeNode<T> | null;

  /**
   * 创建树节点
   *
   * @param value - 节点值
   * @param parent - 父节点（根节点传 null）
   */
  constructor({ value, parent }: { value: T; parent: TreeNode<T> | null }) {
    this.value = value;
    this.parent = parent;
  }

  /** 添加一个子节点 */
  addChild(child: TreeNode<T>) {
    this.children.add(child);
  }

  /** 移除一个子节点 */
  removeChild(child: TreeNode<T>) {
    this.children.delete(child);
  }

  /**
   * 重新挂载到新的父节点下（从原父节点摘除后再挂载）
   *
   * @param parent - 新的父节点
   */
  relink(parent: TreeNode<T>) {
    this.parent?.removeChild(this);

    this.parent = parent;
    this.parent.addChild(this);
  }

  /**
   * 计算当前节点在树中的深度（根为 1）
   * 沿父链向上走；若途中出现环（已访问过的节点）则返回 -1。
   */
  getDepth() {
    const visited = new Set<TreeNode<T>>();

    let depth = 0;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let current: TreeNode<T> | null = this;

    while (current) {
      depth++;
      current = current.parent;

      // Stop on cycle
      if (visited.has(current!)) {
        return -1;
      }
      visited.add(current!);
    }
    return depth;
  }

  /**
   * 判断从当前节点沿父链向上是否会经过目标值（即是否存在环）
   *
   * @param target - 目标值（通常是待挂载的模块）
   * @returns 存在环返回 true
   */
  hasCycleWith(target: T) {
    const visited = new Set<TreeNode<T>>();

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let current: TreeNode<T> | null = this;

    while (current) {
      if (current.value === target) {
        return true;
      }
      current = current.parent;

      if (visited.has(current!)) {
        return false;
      }
      visited.add(current!);
    }
    return false;
  }
}
