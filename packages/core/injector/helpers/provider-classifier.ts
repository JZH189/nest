import {
  ClassProvider,
  FactoryProvider,
  Provider,
  ValueProvider,
} from '@nestjs/common';
import { isUndefined } from '@nestjs/common/utils/shared.utils';

/** 判断是否为 useClass 形式的类 provider（类型守卫） */
export function isClassProvider<T = any>(
  provider: Provider,
): provider is ClassProvider<T> {
  return Boolean((provider as ClassProvider<T>)?.useClass);
}

/** 判断是否为 useValue 形式的值 provider（类型守卫） */
export function isValueProvider<T = any>(
  provider: Provider,
): provider is ValueProvider<T> {
  const providerValue = (provider as ValueProvider)?.useValue;
  return !isUndefined(providerValue);
}

/** 判断是否为 useFactory 形式的工厂 provider（类型守卫） */
export function isFactoryProvider<T = any>(
  provider: Provider,
): provider is FactoryProvider<T> {
  return Boolean((provider as FactoryProvider).useFactory);
}
