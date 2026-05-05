export type ContextType = 'http' | 'ws' | 'rpc';

/**
 * 获取请求和响应对象的方法。
 *
 * @publicApi
 */
export interface HttpArgumentsHost {
  /**
   * 返回飞行中的 `request` 对象。
   */
  getRequest<T = any>(): T;
  /**
   * 返回飞行中的 `response` 对象。
   */
  getResponse<T = any>(): T;
  getNext<T = any>(): T;
}

/**
 * 获取 WebSocket 数据和客户端对象的方法。
 *
 * @publicApi
 */
export interface WsArgumentsHost {
  /**
   * 返回数据对象。
   */
  getData<T = any>(): T;
  /**
   * 返回客户端对象。
   */
  getClient<T = any>(): T;
  /**
   * 返回事件的模式
   */
  getPattern(): string;
}

/**
 * 获取 RPC 数据对象的方法。
 *
 * @publicApi
 */
export interface RpcArgumentsHost {
  /**
   * 返回数据对象。
   */
  getData<T = any>(): T;

  /**
   * 返回上下文对象。
   */
  getContext<T = any>(): T;
}

/**
 * 提供用于检索传递给处理程序的参数的方法。
 * 允许选择适当的执行上下文（例如 Http、RPC 或 WebSockets）来检索参数。
 *
 * @publicApi
 */
export interface ArgumentsHost {
  /**
   * 返回传递给处理程序的参数数组。
   */
  getArgs<T extends Array<any> = any[]>(): T;
  /**
   * 按索引返回特定参数。
   * @param index 要检索的参数索引
   */
  getArgByIndex<T = any>(index: number): T;
  /**
   * 切换上下文到 RPC。
   * @returns 提供检索 RPC 参数方法接口
   */
  switchToRpc(): RpcArgumentsHost;
  /**
   * 切换上下文到 HTTP。
   * @returns 提供检索 HTTP 参数方法接口
   */
  switchToHttp(): HttpArgumentsHost;
  /**
   * 切换上下文到 WebSockets。
   * @returns 提供检索 WebSockets 参数方法接口
   */
  switchToWs(): WsArgumentsHost;
  /**
   * 返回当前执行上下文类型（字符串）
   */
  getType<TContext extends string = ContextType>(): TContext;
}
