import { HttpServer } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { ApplicationConfig } from '../application-config';
import { BaseExceptionFilterContext } from '../exceptions/base-exception-filter-context';
import { ExceptionsHandler } from '../exceptions/exceptions-handler';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { RouterProxyCallback } from './router-proxy';

/**
 * 路由异常过滤器上下文：为每个路由构建异常过滤器链。
 *
 * 在框架中的角色：继承自 BaseExceptionFilterContext，负责收集
 * 全局（useGlobalFilters / app 模块注册）、控制器与方法级别（@UseFilters）
 * 绑定的异常过滤器，并把它们挂到 ExceptionsHandler 上；该处理器随后
 * 会被传给 RouterProxy，用于捕获路由处理过程中的所有异常。
 * 实现 ExceptionsFilter 接口。
 */
export class RouterExceptionFilters extends BaseExceptionFilterContext {
  constructor(
    container: NestContainer,
    private readonly config: ApplicationConfig,
    private readonly applicationRef: HttpServer,
  ) {
    super(container);
  }

  /**
   * 为指定控制器方法创建异常处理器。
   *
   * @param instance - 控制器实例（静态上下文 404/500 兜底时传空对象）。
   * @param callback - 控制器方法。
   * @param moduleKey - 所属模块 key。
   * @param contextId - 上下文 ID（请求作用域过滤器需要）。
   * @param inquirerId - 请求发起者 ID。
   * @returns 挂载了自定义过滤器链的 ExceptionsHandler；无自定义过滤器时
   *          返回仅含内置兜底逻辑的处理器。
   */
  public create(
    instance: Controller,
    callback: RouterProxyCallback,
    moduleKey: string | undefined,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): ExceptionsHandler {
    this.moduleContext = moduleKey!;

    const exceptionHandler = new ExceptionsHandler(this.applicationRef);
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
   * 获取全局异常过滤器元数据。
   *
   * 静态上下文时直接返回全局过滤器实例；请求作用域（或 durable）场景下
   * 还需按 ContextId 从请求作用域过滤器包装器中解析出对应实例并拼接。
   *
   * @param contextId - 上下文 ID。
   * @param inquirerId - 请求发起者 ID。
   * @returns 全局（含请求作用域）过滤器实例数组。
   */
  public getGlobalMetadata<T extends unknown[]>(
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
      .map(wrapper => wrapper.getInstanceByContextId(contextId, inquirerId))
      .filter(host => !!host)
      .map(host => host.instance)
      .toArray();

    return globalFilters.concat(scopedFilters) as T;
  }
}
