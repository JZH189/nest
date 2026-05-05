import { CustomDecorator, SetMetadata, Type } from '@nestjs/common';
import { isEmpty, isObject } from '@nestjs/common/utils/shared.utils';
import { uid } from 'uid';

/**
 * @publicApi
 */
export interface CreateDecoratorOptions<TParam = any, TTransformed = TParam> {
  /**
   * The key for the metadata.
   * @default uid(21)
   */
  key?: string;

  /**
   * The transform function to apply to the metadata value.
   * @default value => value
   */
  transform?: (value: TParam) => TTransformed;
}

type CreateDecoratorWithTransformOptions<
  TParam,
  TTransformed = TParam,
> = CreateDecoratorOptions<TParam, TTransformed> &
  Required<Pick<CreateDecoratorOptions<TParam, TTransformed>, 'transform'>>;

/**
 * @publicApi
 */
export type ReflectableDecorator<TParam, TTransformed = TParam> = ((
  opts?: TParam,
) => CustomDecorator) & {
  KEY: string;
};

/**
 * 提供 Nest 反射功能的辅助类。
 *
 * @see [反射](https://docs.nestjs.cn/guards#putting-it-all-together)
 *
 * @publicApi
 */
export class Reflector {
  /**
   * 创建一个可用于为类和方法添加元数据的装饰器。
   * 可用作 `@SetMetadata` 的强类型替代方案。
   * @param options 装饰器选项。
   * @returns 一个装饰器函数。
   */
  static createDecorator<TParam>(
    options?: CreateDecoratorOptions<TParam>,
  ): ReflectableDecorator<TParam>;
  static createDecorator<TParam, TTransformed>(
    options: CreateDecoratorWithTransformOptions<TParam, TTransformed>,
  ): ReflectableDecorator<TParam, TTransformed>;
  static createDecorator<TParam, TTransformed = TParam>(
    options: CreateDecoratorOptions<TParam, TTransformed> = {},
  ): ReflectableDecorator<TParam, TTransformed> {
    const metadataKey = options.key ?? uid(21);
    const decoratorFn =
      (metadataValue: TParam) =>
      (target: object | Function, key?: string | symbol, descriptor?: any) => {
        const value = options.transform
          ? options.transform(metadataValue)
          : metadataValue;
        SetMetadata(metadataKey, value ?? {})(target, key!, descriptor);
      };

    decoratorFn.KEY = metadataKey;
    return decoratorFn as ReflectableDecorator<TParam, TTransformed>;
  }

  /**
   * 检索指定目标的可反射装饰器的元数据。
   *
   * @example
   * `const roles = this.reflector.get(Roles, context.getHandler());`
   *
   * @param decorator 通过 `Reflector.createDecorator` 创建的可反射装饰器
   * @param target 要从中检索元数据的上下文（装饰对象）
   *
   */
  public get<T extends ReflectableDecorator<any>>(
    decorator: T,
    target: Type<any> | Function,
  ): T extends ReflectableDecorator<any, infer R> ? R : unknown;
  /**
   * 检索指定目标的指定键的元数据。
   *
   * @example
   * `const roles = this.reflector.get<string[]>('roles', context.getHandler());`
   *
   * @param metadataKey 要检索的元数据的查找键
   * @param target 要从中检索元数据的上下文（装饰对象）
   *
   */
  public get<TResult = any, TKey = any>(
    metadataKey: TKey,
    target: Type<any> | Function,
  ): TResult;
  /**
   * 检索指定目标的指定键或装饰器的元数据。
   *
   * @example
   * `const roles = this.reflector.get<string[]>('roles', context.getHandler());`
   *
   * @param metadataKeyOrDecorator 要检索的元数据的查找键或装饰器
   * @param target 要从中检索元数据的上下文（装饰对象）
   *
   */
  public get<TResult = any, TKey = any>(
    metadataKeyOrDecorator: TKey,
    target: Type<any> | Function,
  ): TResult {
    const metadataKey =
      (metadataKeyOrDecorator as ReflectableDecorator<unknown>).KEY ??
      metadataKeyOrDecorator;

    return Reflect.getMetadata(metadataKey, target);
  }

  /**
   * 检索指定目标集的可反射装饰器的元数据。
   *
   * @param decorator 要检索的元数据的查找装饰器
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAll<TParam = any, TTransformed = TParam>(
    decorator: ReflectableDecorator<TParam, TTransformed>,
    targets: (Type<any> | Function)[],
  ): TTransformed extends Array<any> ? TTransformed : TTransformed[];
  /**
   * 检索指定目标集的指定键的元数据。
   *
   * @param metadataKey 要检索的元数据的查找键
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAll<TResult extends any[] = any[], TKey = any>(
    metadataKey: TKey,
    targets: (Type<any> | Function)[],
  ): TResult;
  /**
   * 检索指定目标集的指定键或装饰器的元数据。
   *
   * @param metadataKeyOrDecorator 要检索的元数据的查找键或装饰器
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAll<TResult extends any[] = any[], TKey = any>(
    metadataKeyOrDecorator: TKey,
    targets: (Type<any> | Function)[],
  ): TResult {
    return (targets || []).map(target =>
      this.get(metadataKeyOrDecorator, target),
    ) as TResult;
  }

  /**
   * 检索指定目标集的可反射装饰器的元数据并合并结果。
   *
   * @param decorator 要检索的元数据的查找装饰器
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAllAndMerge<TParam = any, TTransformed = TParam>(
    decorator: ReflectableDecorator<TParam, TTransformed>,
    targets: (Type<any> | Function)[],
  ): TTransformed extends Array<any>
    ? TTransformed
    : TTransformed extends object
      ? TTransformed
      : TTransformed[];
  /**
   * 检索指定目标集的指定键的元数据并合并结果。
   *
   * @param metadataKey 要检索的元数据的查找键
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAllAndMerge<TResult extends any[] | object = any[], TKey = any>(
    metadataKey: TKey,
    targets: (Type<any> | Function)[],
  ): TResult;
  /**
   * 检索指定目标集的指定键或装饰器的元数据并合并结果。
   *
   * @param metadataKeyOrDecorator 要检索的元数据的查找键
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAllAndMerge<TResult extends any[] | object = any[], TKey = any>(
    metadataKeyOrDecorator: TKey,
    targets: (Type<any> | Function)[],
  ): TResult {
    const metadataCollection = this.getAll<any[], TKey>(
      metadataKeyOrDecorator,
      targets,
    ).filter(item => item !== undefined);

    if (isEmpty(metadataCollection)) {
      return metadataCollection as TResult;
    }
    if (metadataCollection.length === 1) {
      const value = metadataCollection[0];
      if (isObject(value)) {
        return value as TResult;
      }
      return metadataCollection as TResult;
    }
    return metadataCollection.reduce((a, b) => {
      if (Array.isArray(a)) {
        return a.concat(b);
      }
      if (isObject(a) && isObject(b)) {
        return {
          ...a,
          ...b,
        };
      }
      return [a, b];
    });
  }

  /**
   * 检索指定目标集的可反射装饰器的元数据并返回第一个非 undefined 值。
   *
   * @param decorator 要检索的元数据的查找装饰器
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAllAndOverride<TParam = any, TTransformed = TParam>(
    decorator: ReflectableDecorator<TParam, TTransformed>,
    targets: (Type<any> | Function)[],
  ): TTransformed;
  /**
   * 检索指定目标集的指定键的元数据并返回第一个非 undefined 值。
   *
   * @param metadataKey 要检索的元数据的查找键
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAllAndOverride<TResult = any, TKey = any>(
    metadataKey: TKey,
    targets: (Type<any> | Function)[],
  ): TResult;
  /**
   * 检索指定目标集的指定键或装饰器的元数据并返回第一个非 undefined 值。
   *
   * @param metadataKeyOrDecorator 要检索的元数据的查找键或元数据
   * @param targets 要从中检索元数据的上下文（装饰对象）
   *
   */
  public getAllAndOverride<TResult = any, TKey = any>(
    metadataKeyOrDecorator: TKey,
    targets: (Type<any> | Function)[],
  ): TResult | undefined {
    for (const target of targets) {
      const result = this.get(metadataKeyOrDecorator, target);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }
}
