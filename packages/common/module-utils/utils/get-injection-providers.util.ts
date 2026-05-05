import { isUndefined } from '../../utils/shared.utils';
import {
  FactoryProvider,
  InjectionToken,
  OptionalFactoryDependency,
  Provider,
} from '../../interfaces';

/**
 * @param value
 * @returns `true` if value is `OptionalFactoryDependency`
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

const mapInjectToTokens = (t: InjectionToken | OptionalFactoryDependency) =>
  isOptionalFactoryDependency(t) ? t.token : t;

/**
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
  let search: InjectionToken[] = tokens!.map(mapInjectToTokens);
  while (search.length > 0) {
    const match = (providers ?? []).filter(
      p =>
        !result.includes(p) && // this prevents circular loops and duplication
        (search.includes(p as any) || search.includes((p as any)?.provide)),
    );
    result.push(...match);
    // get injection tokens of the matched providers, if any
    search = match
      .filter(p => (p as any)?.inject)
      .flatMap(p => (p as FactoryProvider).inject!)
      .map(mapInjectToTokens);
  }
  return result;
}
