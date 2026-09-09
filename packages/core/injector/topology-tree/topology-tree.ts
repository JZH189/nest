import { Module } from '../module';
import { TreeNode } from './tree-node';

/**
 * 模块拓扑树：把模块的 imports 关系（图结构）折叠成一棵以指定模块为根的树。
 *
 * 由于模块图可能存在环（循环导入）与共享子模块（菱形依赖），
 * 构建时会做两类处理：
 * 1. 已出现过的模块不再新建节点，而是通过 links 复用
 * 2. 若发现环（hasCycleWith）则跳过；若同一模块在更浅层级出现，
 *    则将其重新挂载（relink）到更近的父节点下，
 *    保证根到任意节点的路径尽可能短
 *
 * 主要用途是按拓扑深度执行生命周期钩子初始化（浅的模块先初始化）。
 */
export class TopologyTree {
  /** 拓扑树的根节点（发起遍历的模块） */
  private root: TreeNode<Module>;
  /** 模块 -> 树节点的映射（用于复用节点与环检测） */
  private links: Map<Module, TreeNode<Module>> = new Map();

  /**
   * 以指定模块为根构建拓扑树（构造时即完成整棵树的遍历）
   *
   * @param moduleRef - 作为根的模块
   */
  constructor(moduleRef: Module) {
    this.root = new TreeNode<Module>({
      value: moduleRef,
      parent: null,
    });
    this.links.set(moduleRef, this.root);
    this.traverseAndMapToTree(this.root);
  }

  /**
   * 深度优先遍历整棵拓扑树
   *
   * @param callback - 回调，参数为模块引用与其在树中的深度（根为 1）
   */
  public walk(callback: (value: Module, depth: number) => void) {
    function walkNode(node: TreeNode<Module>, depth = 1) {
      callback(node.value, depth);
      node.children.forEach(child => walkNode(child, depth + 1));
    }
    walkNode(this.root);
  }

  /**
   * 递归遍历模块的 imports 并映射为树节点
   *
   * 处理流程：
   * 1. 子模块已存在于树中：检测是否构成环（构成则跳过）；
   *    否则若其现有位置比当前更深，则 relink 到当前节点下（缩短路径）
   * 2. 子模块未出现：创建新节点挂载到当前节点下，登记 links 后继续递归
   */
  private traverseAndMapToTree(node: TreeNode<Module>, depth = 1) {
    if (!node.value.imports) {
      return;
    }
    node.value.imports.forEach(child => {
      if (!child) {
        return;
      }
      if (this.links.has(child)) {
        const existingSubtree = this.links.get(child)!;

        if (node.hasCycleWith(child)) {
          return;
        }
        const existingDepth = existingSubtree.getDepth();
        if (existingDepth < depth) {
          existingSubtree.relink(node);
        }
        return;
      }

      const childNode = new TreeNode<Module>({
        value: child,
        parent: node,
      });
      node.addChild(childNode);

      this.links.set(child, childNode);

      this.traverseAndMapToTree(childNode, depth + 1);
    });
  }
}
