import { DynamicModule } from '@nestjs/common/interfaces/modules/dynamic-module.interface';
import { ForwardReference } from '@nestjs/common/interfaces/modules/forward-reference.interface';
import { Type } from '@nestjs/common/interfaces/type.interface';

/**
 * 模块不透明键工厂接口：为模块生成唯一标识 token 的策略抽象。
 *
 * 容器以该 token 作为模块在 ModulesContainer 中的键，
 * 相同 token 的模块会被视为同一模块（去重/复用）。
 * 可通过 contextOptions.moduleIdGeneratorAlgorithm 选择实现：
 * 'reference'（默认，按对象引用缓存）或 'deep-hash'（按内容深哈希）。
 */
export interface ModuleOpaqueKeyFactory {
  /**
   * Creates a unique opaque key for the given static module.
   * @param moduleCls A static module class.
   * @param originalRef Original object reference. In most cases, it's the same as `moduleCls`.
   */
  createForStatic(
    moduleCls: Type,
    originalRef: Type | ForwardReference,
  ): string;
  /**
   * Creates a unique opaque key for the given dynamic module.
   * @param moduleCls  A dynamic module class reference.
   * @param dynamicMetadata Dynamic module metadata.
   * @param originalRef Original object reference.
   */
  createForDynamic(
    moduleCls: Type<unknown>,
    dynamicMetadata: Omit<DynamicModule, 'module'>,
    originalRef: DynamicModule | ForwardReference,
  ): string;
}
