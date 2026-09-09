import { InjectionToken, Scope } from '@nestjs/common';
import { EnhancerSubtype } from '@nestjs/common/constants';

/**
 * 模块节点：依赖图中代表一个模块（Module）的节点，
 * 元数据描述模块是否全局、是否动态、是否框架内部模块。
 */
export type ModuleNode = {
  metadata: {
    type: 'module';
    global: boolean;
    dynamic: boolean;
    internal: boolean;
  };
};

/**
 * 类节点：依赖图中代表一个"类"（provider、controller、middleware、
 * injectable）的节点，携带作用域、初始化耗时、是否导出等丰富元数据。
 */
export type ClassNode = {
  /** 父节点 id（所属模块节点）。 */
  parent: string;
  metadata: {
    type: 'provider' | 'controller' | 'middleware' | 'injectable';
    subtype?: EnhancerSubtype;
    sourceModuleName: string;
    durable: boolean;
    static: boolean;
    transient: boolean;
    exported: boolean;
    scope: Scope;
    token: InjectionToken;
    initTime: number;
    /**
     * Enhancers metadata collection
     */
    enhancers?: Array<
      | { id: string; subtype: EnhancerSubtype }
      | { name: string; methodKey?: string; subtype: EnhancerSubtype }
    >;
    /**
     * If true, node is a globally registered enhancer
     */
    global?: boolean;
    /**
     * If true, indicates that this node represents an internal provider
     */
    internal?: boolean;
  };
};

/**
 * 节点（Node）：依赖图中的顶点，分为模块节点（ModuleNode）与
 * 类节点（ClassNode）两类，是 SerializedGraph 的基本组成单元。
 */
export type Node = {
  /** 节点唯一 id。 */
  id: string;
  /** 节点显示名称（模块名或类名）。 */
  label: string;
} & (ClassNode | ModuleNode);
