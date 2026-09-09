import { SerializedGraph } from './serialized-graph';

/**
 * 部分图宿主：静态持有应用初始化失败时生成的"部分序列化图"。
 *
 * 在框架中的角色：当容器初始化抛出异常（例如出现未知依赖）时，
 * GraphInspector.registerPartial 会把已构建的不完整图注册到这里；
 * 随后框架可通过 PartialGraphHost.toJSON/toString 序列化输出该图，
 * 帮助开发者通过部分依赖图定位初始化失败的原因。
 */
export class PartialGraphHost {
  /** 静态持有的部分序列化图实例。 */
  private static partialGraph: SerializedGraph;

  /**
   * 将部分图序列化为 JSON。
   *
   * @returns 部分图的 JSON 表示；未注册过则返回 undefined。
   */
  static toJSON() {
    return this.partialGraph?.toJSON();
  }

  /**
   * 将部分图序列化为字符串。
   *
   * @returns 部分图的字符串表示；未注册过则返回 undefined。
   */
  static toString() {
    return this.partialGraph?.toString();
  }

  /**
   * 注册（保存）一个部分序列化图。
   *
   * @param partialGraph - 初始化失败时已构建的不完整图。
   */
  static register(partialGraph: SerializedGraph) {
    this.partialGraph = partialGraph;
  }
}
