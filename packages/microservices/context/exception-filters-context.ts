import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { BaseExceptionFilterContext } from '@nestjs/core/exceptions/base-exception-filter-context';
import { STATIC_CONTEXT } from '@nestjs/core/injector/constants';
import { NestContainer } from '@nestjs/core/injector/container';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { iterate } from 'iterare';
import { Observable } from 'rxjs';
import { RpcExceptionsHandler } from '../exceptions/rpc-exceptions-handler';

/**
 * RPC 异常过滤器上下文：负责为每个消息处理器创建 RpcExceptionsHandler。
 * 1. 读取处理器方法与控制器类上的 @Catch 异常过滤器（EXCEPTION_FILTERS_METADATA）；
 * 2. 叠加全局过滤器（含请求作用域过滤器的按上下文实例化）；
 * 3. 在消息处理器抛出异常时由 ListenersController / RpcContextCreator 使用其做兜底处理。
 *
 * @publicApi
 */
export class ExceptionFiltersContext extends BaseExceptionFilterContext {
  constructor(
    container: NestContainer,
    private readonly config: ApplicationConfig,
  ) {
    super(container);
  }

  /**
   * 为指定处理器创建 RPC 异常处理器。
   * @param instance - 控制器实例
   * @param callback - 处理器回调
   * @param module - 模块名
   * @param contextId - 上下文 ID（静态或请求级）
   * @param inquirerId - 请求发起者 ID（请求作用域）
   * @returns 含自定义过滤器的 RpcExceptionsHandler
   */
  public create(
    instance: Controller,
    callback: <T = any>(data: T) => Observable<any>,
    module: string,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): RpcExceptionsHandler {
    this.moduleContext = module;

    const exceptionHandler = new RpcExceptionsHandler();
    const filters = this.createContext(
      instance,
      callback,
      EXCEPTION_FILTERS_METADATA,
      contextId,
      inquirerId,
    );
    if (isEmpty(filters)) {
      return exceptionHandler;
    }
    exceptionHandler.setCustomFilters(filters.reverse());
    return exceptionHandler;
  }

  /**
   * 获取全局异常过滤器元数据：静态上下文直接返回全局过滤器；
   * 请求级上下文还会按 contextId 实例化请求作用域的全局过滤器后合并。
   * @param contextId - 上下文 ID
   * @param inquirerId - 请求发起者 ID
   * @returns 过滤器实例数组
   */
  public getGlobalMetadata<T extends any[]>(
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): T {
    const globalFilters = this.config.getGlobalFilters() as T;
    if (contextId === STATIC_CONTEXT && !inquirerId) {
      return globalFilters;
    }
    const scopedFilterWrappers =
      this.config.getGlobalRequestFilters() as InstanceWrapper[];
    const scopedFilters = iterate(scopedFilterWrappers)
      .map(wrapper =>
        wrapper.getInstanceByContextId(
          this.getContextId(contextId, wrapper),
          inquirerId,
        ),
      )
      .filter(host => !!host)
      .map(host => host.instance)
      .toArray();

    return globalFilters.concat(scopedFilters) as T;
  }
}
