import { InjectionToken } from './injection-token.interface';

/**
 * 描述工厂提供者 `inject` 数组中的一项可选依赖，
 * 即 `{ token, optional }` 对象形式：token 可缺失时仍允许工厂被解析。
 *
 * @publicApi
 */
export type OptionalFactoryDependency = {
  /** 依赖的注入令牌 */
  token: InjectionToken;
  /** 该依赖是否可选（缺失时注入 undefined 而不报错） */
  optional: boolean;
};
