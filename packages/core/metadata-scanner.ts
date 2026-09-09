import { Injectable } from '@nestjs/common/interfaces/injectable.interface';
import {
  isConstructor,
  isFunction,
  isNil,
} from '@nestjs/common/utils/shared.utils';

/**
 * 元数据扫描器：遍历类原型链上所有"普通函数方法"的工具类。
 *
 * 它是依赖扫描（scanner.ts）与路由解析（router）的底层支撑：
 * - 扫描类上的方法级装饰器元数据（如 @UseGuards 标注的方法）；
 * - 扫描控制器的路由方法（@Get/@Post 等）；
 * - 内部对已扫描的原型做了缓存（cachedScannedPrototypes）以提升性能。
 */
export class MetadataScanner {
  /** 已扫描原型的缓存：原型对象 → 方法名列表 */
  private readonly cachedScannedPrototypes: Map<object, string[]> = new Map();

  /**
   * @deprecated
   * @see {@link getAllMethodNames}
   * @see getAllMethodNames
   */
  public scanFromPrototype<T extends Injectable, R = any>(
    instance: T,
    prototype: object | null,
    callback: (name: string) => R,
  ): R[] {
    if (!prototype) {
      return [];
    }

    const visitedNames = new Map<string, boolean>();
    const result: R[] = [];

    do {
      for (const property of Object.getOwnPropertyNames(prototype)) {
        if (visitedNames.has(property)) {
          continue;
        }

        visitedNames.set(property, true);

        // 原因：https://github.com/nestjs/nest/pull/10821#issuecomment-1411916533
        const descriptor = Object.getOwnPropertyDescriptor(
          prototype,
          property,
        )!;

        if (
          descriptor.set ||
          descriptor.get ||
          isConstructor(property) ||
          !isFunction(prototype[property])
        ) {
          continue;
        }

        const value = callback(property);

        if (isNil(value)) {
          continue;
        }

        result.push(value);
      }
    } while (
      (prototype = Reflect.getPrototypeOf(prototype)) &&
      prototype !== Object.prototype
    );

    return result;
  }

  /**
   * @deprecated
   * @see {@link getAllMethodNames}
   * @see getAllMethodNames
   */
  public *getAllFilteredMethodNames(
    prototype: object,
  ): IterableIterator<string> {
    yield* this.getAllMethodNames(prototype);
  }

  /**
   * 获取原型链上所有可调用方法的名称（带缓存）。
   * 会跳过：getter/setter、构造函数、非函数属性；
   * 沿原型链一直遍历到 Object.prototype 为止，且同名方法只收集一次。
   *
   * @param prototype - 待扫描的原型对象（可为 null）
   * @returns 方法名字符串数组
   */
  public getAllMethodNames(prototype: object | null): string[] {
    if (!prototype) {
      return [];
    }

    if (this.cachedScannedPrototypes.has(prototype)) {
      return this.cachedScannedPrototypes.get(prototype)!;
    }

    const visitedNames = new Map<string, boolean>();
    const result: string[] = [];

    this.cachedScannedPrototypes.set(prototype, result);

    do {
      for (const property of Object.getOwnPropertyNames(prototype)) {
        if (visitedNames.has(property)) {
          continue;
        }

        visitedNames.set(property, true);

        // 原因：https://github.com/nestjs/nest/pull/10821#issuecomment-1411916533
        const descriptor = Object.getOwnPropertyDescriptor(prototype, property);

        if (
          descriptor!.set ||
          descriptor!.get ||
          isConstructor(property) ||
          !isFunction(prototype[property])
        ) {
          continue;
        }

        result.push(property);
      }
    } while (
      (prototype = Reflect.getPrototypeOf(prototype)) &&
      prototype !== Object.prototype
    );

    return result;
  }
}
