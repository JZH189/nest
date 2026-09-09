import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { BaseExceptionFilterContext } from '@nestjs/core/exceptions/base-exception-filter-context';
import { NestContainer } from '@nestjs/core/injector/container';
import { WsExceptionsHandler } from '../exceptions/ws-exceptions-handler';

/**
 * @publicApi
 */
/**
 * WebSocket 异常过滤器上下文：继承 HTTP 侧的 BaseExceptionFilterContext，
 * 负责为某个网关方法实例化其声明的异常过滤器（@Catch / @UseFilters），
 * 并组装为 WsExceptionsHandler。
 *
 * 注意：WebSocket 侧没有全局异常过滤器，getGlobalMetadata 返回空数组。
 *
 * @publicApi
 */
export class ExceptionFiltersContext extends BaseExceptionFilterContext {
  /**
   * @param container - Nest 依赖注入容器，用于解析过滤器依赖。
   */
  constructor(container: NestContainer) {
    super(container);
  }

  /**
   * 为指定网关方法创建异常处理器。
   *
   * 处理步骤：
   * 1. 记录模块上下文（moduleKey），供过滤器解析模块级依赖；
   * 2. 创建一个新的 WsExceptionsHandler；
   * 3. 通过 EXCEPTION_FILTERS_METADATA 元数据实例化方法/类级过滤器；
   * 4. 若没有声明任何过滤器，直接返回空处理器（错误被吞掉）；
   * 5. 否则将过滤器逆序（基类约定：后声明的优先匹配）注入处理器。
   *
   * @param instance - 网关实例。
   * @param callback - 处理方法回调。
   * @param moduleKey - 所在模块标识。
   * @returns 组装完成的 WsExceptionsHandler。
   */
  public create(
    instance: object,
    callback: <TClient>(client: TClient, data: any) => any,
    moduleKey: string,
  ): WsExceptionsHandler {
    this.moduleContext = moduleKey;

    const exceptionHandler = new WsExceptionsHandler();
    const filters = this.createContext(
      instance,
      callback,
      EXCEPTION_FILTERS_METADATA,
    );
    if (isEmpty(filters)) {
      return exceptionHandler;
    }
    exceptionHandler.setCustomFilters(filters.reverse());
    return exceptionHandler;
  }

  /**
   * 获取全局元数据（过滤器）。WebSocket 上下文不支持全局异常过滤器，恒返回空数组。
   *
   * @returns 空数组。
   */
  public getGlobalMetadata<T extends any[]>(): T {
    return [] as any[] as T;
  }
}
