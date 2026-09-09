import { InjectionToken } from '@nestjs/common';
import { ApplicationConfig } from '../application-config';
import { ExternalContextCreator } from '../helpers/external-context-creator';
import { HttpAdapterHost } from '../helpers/http-adapter-host';
import { INQUIRER } from '../injector/inquirer/inquirer-constants';
import { LazyModuleLoader } from '../injector/lazy-module-loader/lazy-module-loader';
import { ModuleRef } from '../injector/module-ref';
import { ModulesContainer } from '../injector/modules-container';
import { REQUEST } from '../router/request/request-constants';
import { Reflector } from '../services/reflector.service';
import { DeterministicUuidRegistry } from './deterministic-uuid-registry';
import { Edge } from './interfaces/edge.interface';
import { Entrypoint } from './interfaces/entrypoint.interface';
import {
  Extras,
  OrphanedEnhancerDefinition,
} from './interfaces/extras.interface';
import { Node } from './interfaces/node.interface';
import { SerializedGraphJson } from './interfaces/serialized-graph-json.interface';
import { SerializedGraphMetadata } from './interfaces/serialized-graph-metadata.interface';

/**
 * 序列化图的状态：partial（不完整，初始化中途失败）或 complete（完整）。
 */
export type SerializedGraphStatus = 'partial' | 'complete';
type WithOptionalId<T extends Record<'id', string>> = Omit<T, 'id'> &
  Partial<Pick<T, 'id'>>;

/**
 * 序列化图：依赖图（节点 + 边 + 入口点 + 附加信息）的内存数据结构与序列化载体。
 *
 * 在框架中的角色：由 NestContainer 持有，GraphInspector 在应用初始化过程中
 * 不断向其中插入模块/类节点与各类边；最终通过 toJSON/toString 序列化为
 * JSON 输出（例如生成依赖图可视化文件）。
 */
export class SerializedGraph {
  /** 所有节点（模块、provider、controller、injectable 等），按 id 索引。 */
  private readonly nodes = new Map<string, Node>();
  /** 所有边（module-to-module、class-to-class 等），按 id 索引。 */
  private readonly edges = new Map<string, Edge>();
  /** 入口点集合：按父节点（类节点）id 分组的处理器方法列表。 */
  private readonly entrypoints = new Map<string, Entrypoint<unknown>[]>();
  /** 附加信息：孤立增强器与已附着增强器列表。 */
  private readonly extras: Extras = {
    orphanedEnhancers: [],
    attachedEnhancers: [],
  };
  /** 当前图状态，默认 complete。 */
  private _status: SerializedGraphStatus = 'complete';
  /** 图的补充元数据（如失败原因），仅在部分图场景下有值。 */
  private _metadata?: SerializedGraphMetadata;

  /**
   * 框架内部 provider 清单：这些 token 对应的节点/边会被标记为 internal，
   * 可视化时可据此隐藏框架自身的实现细节。
   */
  private static readonly INTERNAL_PROVIDERS: Array<InjectionToken> = [
    ApplicationConfig,
    ModuleRef,
    HttpAdapterHost,
    LazyModuleLoader,
    ExternalContextCreator,
    ModulesContainer,
    Reflector,
    SerializedGraph,
    HttpAdapterHost.name,
    Reflector.name,
    REQUEST,
    INQUIRER,
  ];

  /**
   * 设置图状态。
   *
   * @param status - 'partial'（部分图）或 'complete'（完整图）。
   */
  set status(status: SerializedGraphStatus) {
    this._status = status;
  }

  /**
   * 设置图的元数据（如初始化失败的原因描述）。
   *
   * @param metadata - 元数据对象。
   */
  set metadata(metadata: SerializedGraphMetadata) {
    this._metadata = metadata;
  }

  /**
   * 插入一个节点；若 id 已存在则返回已有节点（幂等）。
   *
   * @param nodeDefinition - 节点定义（id、label、metadata 等）。
   * @returns 插入的（或已存在的）节点定义。
   */
  public insertNode(nodeDefinition: Node) {
    if (
      nodeDefinition.metadata.type === 'provider' &&
      SerializedGraph.INTERNAL_PROVIDERS.includes(nodeDefinition.metadata.token)
    ) {
      nodeDefinition.metadata = {
        ...nodeDefinition.metadata,
        internal: true,
      };
    }
    if (this.nodes.has(nodeDefinition.id)) {
      return this.nodes.get(nodeDefinition.id);
    }
    this.nodes.set(nodeDefinition.id, nodeDefinition);
    return nodeDefinition;
  }

  /**
   * 插入一条边；未显式提供 id 时按边定义内容生成确定性 id。
   *
   * @param edgeDefinition - 边定义（source、target、metadata 等，id 可选）。
   * @returns 带 id 的边定义。
   */
  public insertEdge(edgeDefinition: WithOptionalId<Edge>) {
    if (
      edgeDefinition.metadata.type === 'class-to-class' &&
      (SerializedGraph.INTERNAL_PROVIDERS.includes(
        edgeDefinition.metadata.sourceClassToken,
      ) ||
        SerializedGraph.INTERNAL_PROVIDERS.includes(
          edgeDefinition.metadata.targetClassToken,
        ))
    ) {
      edgeDefinition.metadata = {
        ...edgeDefinition.metadata,
        internal: true,
      };
    }
    const id =
      edgeDefinition.id ?? this.generateUuidByEdgeDefinition(edgeDefinition);
    const edge = {
      ...edgeDefinition,
      id,
    };
    this.edges.set(id, edge);
    return edge;
  }

  /**
   * 插入一个入口点（路由处理器方法）定义，按父节点 id 分组存储。
   *
   * @param definition - 入口点定义。
   * @param parentId - 入口点所属的类节点 id。
   */
  public insertEntrypoint<T>(definition: Entrypoint<T>, parentId: string) {
    if (this.entrypoints.has(parentId)) {
      const existingCollection = this.entrypoints.get(parentId)!;
      existingCollection.push(definition);
    } else {
      this.entrypoints.set(parentId, [definition]);
    }
  }

  /**
   * 登记一个孤立增强器（未被任何类附着使用的增强器，如全局 Guard）。
   *
   * @param entry - 孤立增强器定义。
   */
  public insertOrphanedEnhancer(entry: OrphanedEnhancerDefinition) {
    this.extras.orphanedEnhancers.push(entry);
  }

  /**
   * 登记一个已附着增强器（被至少一个类使用的增强器）对应的节点 id。
   *
   * @param nodeId - 增强器节点的 id。
   */
  public insertAttachedEnhancer(nodeId: string) {
    this.extras.attachedEnhancers.push({
      nodeId,
    });
  }

  /**
   * 按 id 获取节点。
   *
   * @param id - 节点 id。
   * @returns 对应的节点定义；不存在则返回 undefined。
   */
  public getNodeById(id: string) {
    return this.nodes.get(id);
  }

  /**
   * 将整张图序列化为 JSON 对象（nodes、edges、entrypoints、extras、
   * status 与 metadata）。
   *
   * @returns 符合 SerializedGraphJson 结构的对象。
   */
  public toJSON(): SerializedGraphJson {
    const json: SerializedGraphJson = {
      nodes: Object.fromEntries(this.nodes),
      edges: Object.fromEntries(this.edges),
      entrypoints: Object.fromEntries(this.entrypoints),
      extras: this.extras,
    };

    if (this._status) {
      json['status'] = this._status;
    }
    if (this._metadata) {
      json['metadata'] = this._metadata;
    }
    return json;
  }

  /**
   * 将整张图序列化为格式化 JSON 字符串（缩进 2 空格）。
   * 对 symbol 与 function 类型的值做了特殊处理以便安全输出。
   *
   * @returns 图的 JSON 字符串表示。
   */
  public toString() {
    const replacer = (key: string, value: unknown) => {
      if (typeof value === 'symbol') {
        return value.toString();
      }
      return typeof value === 'function' ? (value.name ?? 'Function') : value;
    };
    return JSON.stringify(this.toJSON(), replacer, 2);
  }

  /**
   * 根据边定义的内容生成确定性 id（对边定义 JSON 串取哈希）。
   *
   * @param edgeDefinition - 边定义。
   * @returns 确定性的边 id。
   */
  private generateUuidByEdgeDefinition(
    edgeDefinition: WithOptionalId<Edge>,
  ): string {
    return DeterministicUuidRegistry.get(JSON.stringify(edgeDefinition));
  }
}
