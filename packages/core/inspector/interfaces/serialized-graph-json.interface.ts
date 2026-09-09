import { SerializedGraphStatus } from '../serialized-graph';
import { Edge } from './edge.interface';
import { Entrypoint } from './entrypoint.interface';
import { Extras } from './extras.interface';
import { Node } from './node.interface';
import { SerializedGraphMetadata } from './serialized-graph-metadata.interface';

/**
 * 序列化图的 JSON 输出结构：SerializedGraph.toJSON() 的返回类型，
 * 包含全部节点、边、入口点、附加信息以及可选的状态与元数据，
 * 用于依赖图的可视化与持久化。
 */
export interface SerializedGraphJson {
  /** 所有节点，按节点 id 索引。 */
  nodes: Record<string, Node>;
  /** 所有边，按边 id 索引。 */
  edges: Record<string, Edge>;
  /** 入口点集合，按所属类节点 id 分组。 */
  entrypoints: Record<string, Entrypoint<unknown>[]>;
  /** 附加信息（孤立/已附着增强器）。 */
  extras: Extras;
  /** 图状态：partial 或 complete。 */
  status?: SerializedGraphStatus;
  /** 补充元数据（如初始化失败原因）。 */
  metadata?: SerializedGraphMetadata;
}
