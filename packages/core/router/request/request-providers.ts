import { Provider, Scope } from '@nestjs/common';
import { REQUEST } from './request-constants';

// 空实现工厂：REQUEST 提供者的实际值会在每个请求开始时由运行时动态替换
// （注入的是当前请求对象），静态注册阶段无需产生真实值。
const noop = () => {};
/**
 * REQUEST 令牌的请求作用域提供者声明。
 *
 * 在框架中的角色：把它注册进容器后，@Inject(REQUEST) 才能被解析；
 * 由于 scope 为 Scope.REQUEST，每个请求都会通过请求模块的增强器
 * （RequestProvider 明确由各个 HTTP 适配器在请求进入时 set 值）获得独立实例。
 */
export const requestProvider: Provider = {
  provide: REQUEST,
  scope: Scope.REQUEST,
  useFactory: noop,
};
