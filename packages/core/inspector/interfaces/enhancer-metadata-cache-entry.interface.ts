import { Type } from '@nestjs/common';
import { EnhancerSubtype } from '@nestjs/common/constants';
import { InstanceWrapper } from '../../injector/instance-wrapper';

/**
 * 增强器元数据缓存条目：GraphInspector 在检查类时暂存的增强器
 * （Guard/Interceptor/Pipe/Filter）附着信息，待所有模块检查完成后
 * 统一插入为图中的边与 metadata.enhancers 记录。
 */
export interface EnhancerMetadataCacheEntry {
  /** 目标（被附着类）节点的 id，可能缺失。 */
  targetNodeId?: string;
  /** 目标类所在模块的 token。 */
  moduleToken: string;
  /** 被附着的类引用。 */
  classRef: Type;
  /** 附着点：方法名（方法级增强器）或 undefined（类级增强器）。 */
  methodKey: string | undefined;
  /** 增强器类引用（未实例化时使用）。 */
  enhancerRef?: unknown;
  /** 增强器的实例包装器（已由容器管理时使用）。 */
  enhancerInstanceWrapper?: InstanceWrapper;
  /** 增强器子类型：guard、interceptor、pipe 或 filter。 */
  subtype: EnhancerSubtype;
}
