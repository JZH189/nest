import { EnhancerSubtype } from '@nestjs/common/constants';

/**
 * Enhancers attached through APP_PIPE, APP_GUARD, APP_INTERCEPTOR, and APP_FILTER tokens.
 */
export interface AttachedEnhancerDefinition {
  nodeId: string;
}

/**
 * Enhancers registered through "app.useGlobalPipes()", "app.useGlobalGuards()", "app.useGlobalInterceptors()", and "app.useGlobalFilters()" methods.
 */
export interface OrphanedEnhancerDefinition {
  subtype: EnhancerSubtype;
  ref: unknown;
}

/**
 * 序列化图的附加信息集合（Extras）：包含孤立增强器与已附着增强器
 * 两个列表，随 toJSON 一起序列化输出。
 */
export interface Extras {
  /** 孤立增强器列表（未附着到任何类）。 */
  orphanedEnhancers: Array<OrphanedEnhancerDefinition>;
  /** 已附着增强器列表。 */
  attachedEnhancers: Array<AttachedEnhancerDefinition>;
}
