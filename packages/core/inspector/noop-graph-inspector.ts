import { GraphInspector } from './graph-inspector';

const noop = () => {};
/**
 * 空操作（No-op）图检查器：一个所有方法都是 noop 的 GraphInspector 替身。
 *
 * 在框架中的角色：当禁用依赖图内省（如生产环境关闭该特性，或进行
 * 部分图预览时）使用此实例替代真正的 GraphInspector，避免产生
 * 构图开销；基于 Proxy 实现，任何属性访问都返回空函数。
 */
export const NoopGraphInspector: GraphInspector = new Proxy(
  GraphInspector.prototype,
  {
    get: () => noop,
  },
);
