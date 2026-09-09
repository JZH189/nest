import { ArgumentsHost } from '@nestjs/common';
import { ExceptionFilterMetadata } from '@nestjs/common/interfaces/exceptions/exception-filter-metadata.interface';
import { selectExceptionFilterMetadata } from '@nestjs/common/utils/select-exception-filter-metadata.util';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { InvalidExceptionFilterException } from '@nestjs/core/errors/exceptions/invalid-exception-filter.exception';
import { WsException } from '../errors/ws-exception';
import { BaseWsExceptionFilter } from './base-ws-exception-filter';

/**
 * WebSocket 异常处理器（WsExceptionsHandler）：WsProxy 捕获异常后的统一入口。
 *
 * 处理优先级：先尝试方法/类级自定义异常过滤器（invokeCustomFilters），
 * 命中则交由用户过滤器处理；否则回退到基类 BaseWsExceptionFilter 的默认行为
 * （向客户端 emit 'exception' 事件）。
 *
 * @publicApi
 */
export class WsExceptionsHandler extends BaseWsExceptionFilter {
  /** 方法/类级自定义异常过滤器元数据列表。 */
  private filters: ExceptionFilterMetadata[] = [];

  /**
   * 处理异常：优先走自定义过滤器，未被处理且客户端支持 emit 时走默认处理。
   *
   * @param exception - 捕获到的异常。
   * @param host - 执行上下文宿主。
   * @returns 无返回值。
   */
  public handle(exception: Error | WsException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient();
    if (this.invokeCustomFilters(exception, host) || !client.emit) {
      return;
    }
    super.catch(exception, host);
  }

  /**
   * 注册自定义异常过滤器（由 ExceptionFiltersContext.create 调用）。
   *
   * @param filters - 过滤器元数据数组。
   * @returns 无返回值（非数组参数会抛出 InvalidExceptionFilterException）。
   */
  public setCustomFilters(filters: ExceptionFilterMetadata[]) {
    if (!Array.isArray(filters)) {
      throw new InvalidExceptionFilterException();
    }
    this.filters = filters;
  }

  /**
   * 依次匹配并调用能处理该异常的自定义过滤器。
   *
   * 处理步骤：
   * 1. 无自定义过滤器时直接返回 false；
   * 2. 用 selectExceptionFilterMetadata 按异常类型选出第一个匹配的过滤器；
   * 3. 命中则执行其 func 并返回 true。
   *
   * @param exception - 捕获到的异常。
   * @param args - 执行上下文宿主。
   * @returns 是否有自定义过滤器处理了该异常。
   */
  public invokeCustomFilters<T = any>(
    exception: T,
    args: ArgumentsHost,
  ): boolean {
    if (isEmpty(this.filters)) return false;

    const filter = selectExceptionFilterMetadata(this.filters, exception);
    filter && filter.func(exception, args);
    return !!filter;
  }
}
