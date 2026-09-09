import { isUndefined } from '../../utils/shared.utils';
import {
  FactoryProvider,
  InjectionToken,
  OptionalFactoryDependency,
  Provider,
} from '../../interfaces';

/**
 * 类型守卫：判断给定值是否为 "OptionalFactoryDependency" 对象。
 * 该对象形如 { token, optional }，而不是一个普通的注入令牌（字符串/symbol/类）。
 *
 * @param value 待判断的值（注入令牌或可选工厂依赖对象）
 * @returns 如果 value 是 `OptionalFactoryDependency` 则返回 `true`
 */
function isOptionalFactoryDependency(
  value: InjectionToken | OptionalFactoryDependency,
): value is OptionalFactoryDependency {
  return (
    !isUndefined((value as OptionalFactoryDependency).token) &&
    !isUndefined((value as OptionalFactoryDependency).optional) &&
    !(value as any).prototype
  );
}

/**
 * 将注入项归一化为纯粹的注入令牌：
 * 如果是 "OptionalFactoryDependency" 对象则取其 token，否则原样返回。
 */
const mapInjectToTokens = (t: InjectionToken | OptionalFactoryDependency) =>
  isOptionalFactoryDependency(t) ? t.token : t;

/**
 * 从给定的提供者列表中，递归筛选出解析指定注入令牌所需的所有提供者。
 * 主要供 "ConfigurableModuleBuilder" 的 "provideInjectionTokensFrom" 特性使用：
 * 当异步模块需要注入父模块的提供者时，从父模块提供者列表中挑出
 * factory 的 inject 数组所依赖的提供者（含这些提供者自身的依赖，逐层展开）。
 *
 * @param providers 模块的提供者列表
 * @param tokens useFactory 函数所需的注入令牌（通常是模块选项的令牌）
 * @returns 令牌注入所需的所有提供者（递归搜索）
 */
export function getInjectionProviders(
  providers: Provider[],
  tokens: FactoryProvider['inject'],
): Provider[] {
  const result: Provider[] = [];
  // 将初始注入项归一化为令牌列表
  let search: InjectionToken[] = tokens!.map(mapInjectToTokens);
  while (search.length > 0) {
    // 1. 找到当前待搜索令牌匹配的提供者（令牌本身即提供者，或其 provide 属性匹配）；
    //    排除已收录的提供者，防止循环依赖与重复收集
    const match = (providers ?? []).filter(
      p =>
        !result.includes(p) && // this prevents circular loops and duplication
        (search.includes(p as any) || search.includes((p as any)?.provide)),
    );
    result.push(...match);
    // 2. 提取这些提供者自身的注入令牌（若有），作为下一轮搜索目标，
    //    从而实现多层依赖的递归解析；直到没有新的令牌需要解析为止
    search = match
      .filter(p => (p as any)?.inject)
      .flatMap(p => (p as FactoryProvider).inject!)
      .map(mapInjectToTokens);
  }
  return result;
}
