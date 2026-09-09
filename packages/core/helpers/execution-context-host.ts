import { ExecutionContext } from '@nestjs/common';
import { Type } from '@nestjs/common/interfaces';
import {
  ContextType,
  HttpArgumentsHost,
  RpcArgumentsHost,
  WsArgumentsHost,
} from '@nestjs/common/interfaces/features/arguments-host.interface';

/**
 * 执行上下文宿主：ExecutionContext 接口的通用运行时实现。
 *
 * 在框架中的角色：守卫、拦截器、管道、自定义装饰器拿到的 ExecutionContext
 * 都由本类承载。它持有路由参数数组（args）、控制器类引用与处理方法，
 * 并通过 switchToHttp / switchToWs / switchToRpc 切换到具体传输层的
 * 参数宿主视图（注意：switchXxx 是把宿主方法混入当前对象，原地切换）。
 */
export class ExecutionContextHost implements ExecutionContext {
  private contextType = 'http';

  /**
   * @param args - 路由参数数组（按传输层不同含义不同，如 HTTP 为 [req, res, next]）
   * @param constructorRef - 控制器类引用（可为 null）
   * @param handler - 即将执行的处理方法（可为 null）
   */
  constructor(
    private readonly args: any[],
    private readonly constructorRef: Type<any> | null = null,
    private readonly handler: Function | null = null,
  ) {}

  /**
   * 设置上下文类型（'http'、'ws'、'rpc' 等）。
   * @param type - 上下文类型字符串
   */
  setType<TContext extends string = ContextType>(type: TContext) {
    type && (this.contextType = type);
  }

  /**
   * 获取当前上下文类型。
   * @returns 上下文类型字符串
   */
  getType<TContext extends string = ContextType>(): TContext {
    return this.contextType as TContext;
  }

  /**
   * 获取当前处理逻辑所在的控制器类。
   * @returns 控制器类引用
   */
  getClass<T = any>(): Type<T> {
    return this.constructorRef!;
  }

  /**
   * 获取即将执行的（路由）处理方法。
   * @returns 处理方法函数
   */
  getHandler(): Function {
    return this.handler!;
  }

  /**
   * 获取完整的路由参数数组。
   * @returns 参数数组
   */
  getArgs<T extends Array<any> = any[]>(): T {
    return this.args as T;
  }

  /**
   * 按索引获取单个路由参数。
   * @param index - 参数位置索引
   * @returns 对应位置的参数值
   */
  getArgByIndex<T = any>(index: number): T {
    return this.args[index] as T;
  }

  /**
   * 切换为 RPC 参数宿主视图：data 为第 0 个参数，context 为第 1 个。
   * @returns 带有 getData / getContext 方法的 RPC 参数宿主
   */
  switchToRpc(): RpcArgumentsHost {
    return Object.assign(this, {
      getData: () => this.getArgByIndex(0),
      getContext: () => this.getArgByIndex(1),
    });
  }

  /**
   * 切换为 HTTP 参数宿主视图：request / response / next 分别对应前三个参数。
   * @returns 带有 getRequest / getResponse / getNext 方法的 HTTP 参数宿主
   */
  switchToHttp(): HttpArgumentsHost {
    return Object.assign(this, {
      getRequest: () => this.getArgByIndex(0),
      getResponse: () => this.getArgByIndex(1),
      getNext: () => this.getArgByIndex(2),
    });
  }

  /**
   * 切换为 WebSocket（网关）参数宿主视图：client / data / pattern 按约定位置取值。
   * @returns 带有 getClient / getData / getPattern 方法的 WS 参数宿主
   */
  switchToWs(): WsArgumentsHost {
    return Object.assign(this, {
      getClient: () => this.getArgByIndex(0),
      getData: () => this.getArgByIndex(1),
      getPattern: () => this.getArgByIndex(this.getArgs().length - 1),
    });
  }
}
