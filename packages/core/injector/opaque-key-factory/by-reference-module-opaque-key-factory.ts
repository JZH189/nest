import { DynamicModule } from '@nestjs/common/interfaces/modules/dynamic-module.interface';
import { ForwardReference } from '@nestjs/common/interfaces/modules/forward-reference.interface';
import { Type } from '@nestjs/common/interfaces/type.interface';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { createHash } from 'crypto';
import { ModuleOpaqueKeyFactory } from './interfaces/module-opaque-key-factory.interface';

const K_MODULE_ID = Symbol('K_MODULE_ID');

/**
 * 基于对象引用的模块不透明键工厂（默认策略）
 *
 * 为每个模块定义（类/动态模块/forwardRef）在**对象引用**上缓存一个唯一 ID
 * （挂在 Symbol 属性 K_MODULE_ID 上，同一引用重复注册会复用同一 ID）。
 *
 * 键生成策略：
 * - 'random'：直接生成随机字符串（默认，开发/热重载友好）
 * - 'shallow'：随机前缀 + 模块内容浅哈希（sha256），快照模式下可生成确定性 ID
 */
export class ByReferenceModuleOpaqueKeyFactory implements ModuleOpaqueKeyFactory {
  /** 键生成策略：random（纯随机）或 shallow（随机前缀 + 浅哈希） */
  private readonly keyGenerationStrategy: 'random' | 'shallow';

  /**
   * 创建键工厂
   *
   * @param options - 可选的策略配置，默认为 'random'
   */
  constructor(options?: { keyGenerationStrategy: 'random' | 'shallow' }) {
    this.keyGenerationStrategy = options?.keyGenerationStrategy ?? 'random';
  }

  /**
   * 为静态模块创建唯一键
   *
   * @param moduleCls - 静态模块类
   * @param originalRef - 原始对象引用（通常是 moduleCls 本身或 forwardRef 包装）
   * @returns 模块唯一标识字符串
   */
  public createForStatic(
    moduleCls: Type,
    originalRef: Type | ForwardReference = moduleCls,
  ): string {
    return this.getOrCreateModuleId(moduleCls, undefined, originalRef);
  }

  /**
   * 为动态模块创建唯一键（同一动态配置引用复用同一 ID）
   *
   * @param moduleCls - 动态模块类引用
   * @param dynamicMetadata - 动态模块元数据
   * @param originalRef - 原始对象引用（动态模块对象或 forwardRef 包装）
   * @returns 模块唯一标识字符串
   */
  public createForDynamic(
    moduleCls: Type<unknown>,
    dynamicMetadata: Omit<DynamicModule, 'module'>,
    originalRef: DynamicModule | ForwardReference,
  ): string {
    return this.getOrCreateModuleId(moduleCls, dynamicMetadata, originalRef);
  }

  /**
   * 获取或创建模块 ID：原始引用上已缓存则直接返回；
   * 否则按策略生成（random：随机串；shallow：随机串 + 内容哈希），
   * 并把结果缓存到原始引用的 Symbol 属性上。
   */
  private getOrCreateModuleId(
    moduleCls: Type<unknown>,
    dynamicMetadata: Partial<DynamicModule> | undefined,
    originalRef: Type | DynamicModule | ForwardReference,
  ): string {
    if (originalRef[K_MODULE_ID]) {
      return originalRef[K_MODULE_ID];
    }

    let moduleId: string;
    if (this.keyGenerationStrategy === 'random') {
      moduleId = this.generateRandomString();
    } else {
      const delimiter = ':';
      moduleId = dynamicMetadata
        ? `${this.generateRandomString()}${delimiter}${this.hashString(moduleCls.name + JSON.stringify(dynamicMetadata))}`
        : `${this.generateRandomString()}${delimiter}${this.hashString(moduleCls.toString())}`;
    }

    originalRef[K_MODULE_ID] = moduleId;
    return moduleId;
  }

  /** 计算字符串的 sha256 十六进制哈希 */
  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** 生成随机字符串 */
  private generateRandomString(): string {
    return randomStringGenerator();
  }
}
