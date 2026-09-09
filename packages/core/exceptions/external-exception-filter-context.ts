import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import { Controller } from '@nestjs/common/interfaces';
import { ExceptionFilterMetadata } from '@nestjs/common/interfaces/exceptions';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { ApplicationConfig } from '../application-config';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { RouterProxyCallback } from '../router/router-proxy';
import { BaseExceptionFilterContext } from './base-exception-filter-context';
import { ExternalExceptionsHandler } from './external-exceptions-handler';

/**
 * 外部异常过滤器上下文创建器，服务于“外部路由”的异常过滤体系。
 *
 * 在框架中的角色：当用户通过适配器手动注册路由（不经过 Nest 的路由工厂，
 * 见 NestApplicationContext / ExternalContextCreator 流程）时，本类负责为该
 * 路由创建 ExternalExceptionsHandler：收集路由/控制器上 @UseFilters() 的
 * 过滤器，并合并全局过滤器。它继承 BaseExceptionFilterContext，复用过滤器
 * 元数据编译逻辑，仅在实例解析（含全局请求级过滤器）上有所扩展。
 */
export class ExternalExceptionFilterContext extends BaseExceptionFilterContext {
  constructor(
    container: NestContainer,
    private readonly config?: ApplicationConfig,
  ) {
    super(container);
  }

  /**
   * 为指定控制器方法创建外部异常处理器。
   * @param instance - 控制器实例
   * @param callback - 被代理的路由处理回调
   * @param module - 控制器所属模块的标识（token），用于解析注入的过滤器类
   * @param contextId - 请求上下文 ID（请求级作用域用），默认为静态上下文
   * @param inquirerId - 请求发起者 ID（瞬态作用域用）
   * @returns 配置好自定义过滤器的 ExternalExceptionsHandler 实例
   */
  public create(
    instance: Controller,
    callback: RouterProxyCallback,
    module: string,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): ExternalExceptionsHandler {
    // 记录模块上下文，供 getInstanceByMetatype 在对应模块中解析过滤器类
    this.moduleContext = module;

    const exceptionHandler = new ExternalExceptionsHandler();
    // 通过基类的 createContext（ContextCreator 模板方法）编译过滤器元数据
    const filters = this.createContext<ExceptionFilterMetadata[]>(
      instance,
      callback,
      EXCEPTION_FILTERS_METADATA,
      contextId,
      inquirerId,
    );
    if (isEmpty(filters)) {
      return exceptionHandler;
    }
    // 反转后注册：后注册的过滤器优先匹配（保证语义与内建顺序一致）
    exceptionHandler.setCustomFilters(filters.reverse());
    return exceptionHandler;
  }

  /**
   * 获取全局异常过滤器元数据：包含全局静态过滤器与当前请求上下文下的
   * 请求级过滤器实例。
   * @param contextId - 请求上下文 ID，默认为静态上下文
   * @param inquirerId - 请求发起者 ID
   * @returns 合并后的全局过滤器数组
   */
  public getGlobalMetadata<T extends any[]>(
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): T {
    if (!this.config) {
      return [] as any[] as T;
    }
    // 应用启动阶段（app.useGlobalFilters）注册的全局过滤器
    const globalFilters = this.config.getGlobalFilters() as T;
    if (contextId === STATIC_CONTEXT && !inquirerId) {
      return globalFilters;
    }
    // 请求级作用域的全局过滤器（DI 容器中按请求解析的实例）需在当前上下文中取实例
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
