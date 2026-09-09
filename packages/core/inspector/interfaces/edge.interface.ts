import { InjectionToken } from '@nestjs/common';

type CommonEdgeMetadata = {
  sourceModuleName: string;
  targetModuleName: string;
};

type ModuleToModuleEdgeMetadata = {
  type: 'module-to-module';
} & CommonEdgeMetadata;

type ClassToClassEdgeMetadata = {
  type: 'class-to-class';
  sourceClassName: string;
  targetClassName: string;
  sourceClassToken: InjectionToken;
  targetClassToken: InjectionToken;
  injectionType: 'constructor' | 'property' | 'decorator';
  keyOrIndex?: string | number | symbol;
  /**
   * If true, indicates that this edge represents an internal providers connection
   */
  internal?: boolean;
} & CommonEdgeMetadata;

/**
 * 边（Edge）接口：依赖图中的一条有向连接，表示模块间导入关系
 * 或类之间的注入（依赖）关系。
 */
export interface Edge {
  /** 边的唯一 id。 */
  id: string;
  /** 起点节点 id。 */
  source: string;
  /** 终点节点 id。 */
  target: string;
  /** 边的元数据：模块到模块，或类到类。 */
  metadata: ModuleToModuleEdgeMetadata | ClassToClassEdgeMetadata;
}
