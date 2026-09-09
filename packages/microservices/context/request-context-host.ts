import { BaseRpcContext } from '../ctx-host/base-rpc.context';
import { RequestContext } from '../interfaces';

/**
 * 请求上下文宿主：在消息到达处理器时封装“一次 RPC 请求”的三要素——
 * pattern（消息模式）、data（消息数据）、context（传输层 RPC 上下文，如 KafkaContext）。
 * 请求作用域处理器借助它生成 contextId 并注册请求级 provider（REQUEST/CONTEXT 注入），
 * 用户在处理器中通过 @Ctx() 装饰器拿到的 context 即来自这里。
 *
 * @publicApi
 */
export class RequestContextHost<
  TData = any,
  TContext extends BaseRpcContext = any,
> implements RequestContext<TData> {
  /**
   * @param pattern - 消息模式
   * @param data - 消息数据
   * @param context - 传输层 RPC 上下文宿主
   */
  constructor(
    public readonly pattern: string | Record<string, any>,
    public readonly data: TData,
    public readonly context: TContext,
  ) {}

  /**
   * 创建 RequestContextHost 实例的静态工厂方法。
   * @param pattern - 消息模式
   * @param data - 消息数据
   * @param context - 传输层 RPC 上下文
   * @returns 请求上下文宿主
   */
  static create<TData, TContext extends BaseRpcContext>(
    pattern: string | Record<string, any>,
    data: TData,
    context: TContext,
  ): RequestContext<TData, TContext> {
    const host = new RequestContextHost(pattern, data, context);
    return host;
  }

  /** 获取消息数据 */
  public getData(): TData {
    return this.data;
  }

  /** 获取消息模式 */
  public getPattern(): string | Record<string, any> {
    return this.pattern;
  }

  /** 获取传输层 RPC 上下文 */
  public getContext(): TContext {
    return this.context;
  }
}
