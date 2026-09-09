import { HttpException } from '@nestjs/common';
import { ExceptionFilterMetadata } from '@nestjs/common/interfaces/exceptions/exception-filter-metadata.interface';
import { ArgumentsHost } from '@nestjs/common/interfaces/features/arguments-host.interface';
import { selectExceptionFilterMetadata } from '@nestjs/common/utils/select-exception-filter-metadata.util';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { InvalidExceptionFilterException } from '../errors/exceptions/invalid-exception-filter.exception';
import { BaseExceptionFilter } from './base-exception-filter';

/**
 * 内置异常处理器，HTTP 请求管道中路由处理抛错后的第一站。
 *
 * 在框架中的角色：RouterProxy 为每个路由处理器包装的回调在出错时会调用
 * 本类的 next()。处理顺序为：
 * 1. 先尝试用路由上通过 @UseFilters() 注册的自定义过滤器处理；
 * 2. 若没有匹配的过滤器，则退回 BaseExceptionFilter 的兜底逻辑。
 *
 * 与 ExternalExceptionsHandler 的区别：本类服务于框架内部的路由处理流程，
 * 后者服务于通过适配器直接注册的外部（非框架托管）路由。
 */
export class ExceptionsHandler extends BaseExceptionFilter {
  private filters: ExceptionFilterMetadata[] = [];

  /**
   * 异常处理主流程：先尝试自定义过滤器，未命中则走基类兜底。
   * @param exception - 抛出的异常（普通 Error 或 HttpException）
   * @param ctx - ArgumentsHost，提供请求上下文参数
   */
  public next(exception: Error | HttpException, ctx: ArgumentsHost) {
    if (this.invokeCustomFilters(exception, ctx)) {
      return;
    }
    super.catch(exception, ctx);
  }

  /**
   * 设置路由级自定义过滤器列表（由 ExceptionsHandler 代理在拦截路由时注入）。
   * @param filters - 由 BaseExceptionFilterContext 编译出的过滤器元数据数组
   * @throws 传入参数不是数组时抛出 InvalidExceptionFilterException
   */
  public setCustomFilters(filters: ExceptionFilterMetadata[]) {
    if (!Array.isArray(filters)) {
      throw new InvalidExceptionFilterException();
    }
    this.filters = filters;
  }

  /**
   * 遍历已注册的过滤器，找到第一个能捕获该异常的过滤器并执行。
   * @param exception - 抛出的异常
   * @param ctx - ArgumentsHost，传递给过滤器的上下文
   * @returns 若有过滤器命中并处理则返回 true，否则返回 false
   */
  public invokeCustomFilters<T = any>(
    exception: T,
    ctx: ArgumentsHost,
  ): boolean {
    if (isEmpty(this.filters)) {
      return false;
    }

    // 从过滤器列表中选出类型匹配（@Catch 声明可捕获该异常）的过滤器
    const filter = selectExceptionFilterMetadata(this.filters, exception);
    filter && filter.func(exception, ctx);
    return !!filter;
  }
}
