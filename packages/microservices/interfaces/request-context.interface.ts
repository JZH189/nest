import { BaseRpcContext } from '../ctx-host/base-rpc.context';

/**
 * 请求上下文描述：把一条微服务消息的 pattern、负载与 RPC 上下文
 * 组合成统一的对象形式（并提供 getData/getPattern/getContext 访问器），
 * 便于跨传输器以一致的形状处理消息。
 *
 * @typeParam TData - 消息负载类型
 * @typeParam TContext - RPC 上下文类型（BaseRpcContext 的子类）
 */
export interface RequestContext<
  TData = any,
  TContext extends BaseRpcContext = any,
> {
  /** 消息模式（字符串路由或对象 pattern）。 */
  pattern: string | Record<string, any>;
  /** 消息负载。 */
  data: TData;
  /** RPC 上下文（含 headers 等传输层元信息）。 */
  context?: TContext;

  /** 读取消息负载。 */
  getData(): TData;
  /** 读取消息模式。 */
  getPattern(): string | Record<string, any>;
  /** 读取 RPC 上下文。 */
  getContext(): TContext;
}
