import { DynamicModule } from '@nestjs/common/interfaces/modules/dynamic-module.interface';
import { Type } from '@nestjs/common/interfaces/type.interface';
import { Logger } from '@nestjs/common/services/logger.service';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { isFunction, isSymbol } from '@nestjs/common/utils/shared.utils';
import { createHash } from 'crypto';
import stringify from 'fast-safe-stringify';
import { ModuleOpaqueKeyFactory } from './interfaces/module-opaque-key-factory.interface';

const CLASS_STR = 'class ';
const CLASS_STR_LEN = CLASS_STR.length;

/**
 * 深度哈希模块不透明键工厂（moduleIdGeneratorAlgorithm: 'deep-hash' 策略）
 *
 * 通过对"模块 ID + 模块名 + 动态元数据序列化结果"整体做 sha256 生成键：
 * 相同内容的动态模块（即使配置对象是不同引用）会得到相同的键，从而被容器去重。
 * 代价是序列化动态元数据的开销，序列化超过 10ms 时会输出性能告警。
 */
export class DeepHashedModuleOpaqueKeyFactory implements ModuleOpaqueKeyFactory {
  /** 模块类 -> 随机模块 ID 的缓存（WeakMap，类被回收后缓存随之释放） */
  private readonly moduleIdsCache = new WeakMap<Type<unknown>, string>();
  /** "moduleId_模块名" -> 已计算哈希键的缓存 */
  private readonly moduleTokenCache = new Map<string, string>();
  private readonly logger = new Logger(DeepHashedModuleOpaqueKeyFactory.name, {
    timestamp: true,
  });

  /**
   * 为静态模块创建唯一键（moduleId + 模块名的 sha256）
   *
   * @param moduleCls - 静态模块类
   * @returns 模块唯一标识字符串
   */
  public createForStatic(moduleCls: Type): string {
    const moduleId = this.getModuleId(moduleCls);
    const moduleName = this.getModuleName(moduleCls);

    const key = `${moduleId}_${moduleName}`;
    if (this.moduleTokenCache.has(key)) {
      return this.moduleTokenCache.get(key)!;
    }

    const hash = this.hashString(key);
    this.moduleTokenCache.set(key, hash);
    return hash;
  }

  /**
   * 为动态模块创建唯一键
   *
   * 将 { id, module, dynamic 元数据 } 安全序列化后做 sha256；
   * 序列化耗时超过 10ms 时输出告警（提示改用 reference 策略）。
   *
   * @param moduleCls - 动态模块类引用
   * @param dynamicMetadata - 动态模块元数据
   * @returns 模块唯一标识字符串
   */
  public createForDynamic(
    moduleCls: Type<unknown>,
    dynamicMetadata: Omit<DynamicModule, 'module'>,
  ): string {
    const moduleId = this.getModuleId(moduleCls);
    const moduleName = this.getModuleName(moduleCls);
    const opaqueToken = {
      id: moduleId,
      module: moduleName,
      dynamic: dynamicMetadata,
    };
    const start = performance.now();
    const opaqueTokenString = this.getStringifiedOpaqueToken(opaqueToken);
    const timeSpentInMs = performance.now() - start;

    if (timeSpentInMs > 10) {
      const formattedTimeSpent = timeSpentInMs.toFixed(2);
      this.logger.warn(
        `The module "${opaqueToken.module}" is taking ${formattedTimeSpent}ms to serialize, this may be caused by larger objects statically assigned to the module. Consider changing the "moduleIdGeneratorAlgorithm" option to "reference" to improve the performance.`,
      );
    }

    return this.hashString(opaqueTokenString);
  }

  /**
   * 将不透明 token 对象序列化为字符串
   *
   * 使用 fast-safe-stringify（而非 JSON.stringify）以支持循环引用的动态模块；
   * replacer 用于把函数/类还原为真实名称，避免统一变成 "Function" 键。
   *
   * @param opaqueToken - 待序列化的 token 对象
   * @returns 序列化后的字符串
   */
  public getStringifiedOpaqueToken(opaqueToken: object | undefined): string {
    // Uses safeStringify instead of JSON.stringify to support circular dynamic modules
    // The replacer function is also required in order to obtain real class names
    // instead of the unified "Function" key
    return opaqueToken ? stringify(opaqueToken, this.replacer) : '';
  }

  /** 获取（或首次生成并缓存）模块类的随机 ID */
  public getModuleId(metatype: Type<unknown>): string {
    let moduleId = this.moduleIdsCache.get(metatype);
    if (moduleId) {
      return moduleId;
    }
    moduleId = randomStringGenerator();
    this.moduleIdsCache.set(metatype, moduleId);
    return moduleId;
  }

  /** 获取模块类名 */
  public getModuleName(metatype: Type<any>): string {
    return metatype.name;
  }

  /** 计算字符串的 sha256 十六进制哈希 */
  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * 序列化替换器：类返回类名、普通函数返回源码字符串、Symbol 转字符串，
   * 其余原样返回（保证哈希输入稳定且可读）。
   */
  private replacer(key: string, value: any) {
    if (isFunction(value)) {
      const funcAsString = value.toString();
      const isClass = funcAsString.slice(0, CLASS_STR_LEN) === CLASS_STR;
      if (isClass) {
        return value.name;
      }
      return funcAsString;
    }
    if (isSymbol(value)) {
      return value.toString();
    }
    return value;
  }
}
