import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { DeterministicUuidRegistry } from './deterministic-uuid-registry';

/**
 * UUID 生成模式枚举。
 */
export enum UuidFactoryMode {
  /** 随机模式：每次生成随机 id（默认）。 */
  Random = 'random',
  /** 确定性模式：依据相同输入生成相同 id，用于可复现的依赖图。 */
  Deterministic = 'deterministic',
}

/**
 * UUID 工厂：为依赖图中的节点/边统一生成 id。
 *
 * 在框架中的角色：GraphInspector 与容器通过它获取实例 id；
 * 默认使用随机模式，当需要生成可复现（确定性）的依赖图时
 * 可切换为 Deterministic 模式，由 DeterministicUuidRegistry 提供稳定 id。
 */
export class UuidFactory {
  /** 当前 id 生成模式，默认随机。 */
  private static _mode = UuidFactoryMode.Random;

  /**
   * 设置 id 生成模式。
   *
   * @param value - 目标模式（random 或 deterministic）。
   */
  static set mode(value: UuidFactoryMode) {
    this._mode = value;
  }

  /**
   * 按当前模式生成一个 id。
   *
   * @param key - 确定性模式下用于派生 id 的键（随机模式下忽略）。
   * @returns 生成的 id 字符串。
   */
  static get(key = '') {
    return this._mode === UuidFactoryMode.Deterministic
      ? DeterministicUuidRegistry.get(key)
      : randomStringGenerator();
  }
}
