import { ExceptionFilterMetadata } from '@nestjs/common/interfaces/exceptions';
import { ArgumentsHost } from '@nestjs/common/interfaces/features/arguments-host.interface';
import { selectExceptionFilterMetadata } from '@nestjs/common/utils/select-exception-filter-metadata.util';
import { isEmpty } from '@nestjs/common/utils/shared.utils';
import { InvalidExceptionFilterException } from '../errors/exceptions/invalid-exception-filter.exception';
import { ExternalExceptionFilter } from './external-exception-filter';

/**
 * 外部异常处理器，服务于通过适配器直接注册的“外部路由”。
 *
 * 在框架中的角色：ExternalExceptionFilterContext.create() 会为本类实例
 * 注入路由级自定义过滤器。当外部路由回调抛错时，处理顺序为：
 * 1. 先尝试调用匹配的自定义过滤器；
 * 2. 若没有命中，则退回 ExternalExceptionFilter（记录日志后重新抛出）。
 *
 * 与 ExceptionsHandler 的区别：本类不直接写 HTTP 响应，因此其兜底逻辑
 * 是“重抛”而非“写响应体”。
 */
export class ExternalExceptionsHandler extends ExternalExceptionFilter {
  private filters: ExceptionFilterMetadata[] = [];

  /**
   * 异常处理主流程：先尝试自定义过滤器，未命中则走基类的重抛逻辑。
   * @param exception - 抛出的异常
   * @param host - ArgumentsHost，提供请求上下文参数
   * @returns 过滤器处理结果；无过滤器命中时返回基类 catch 的结果（实际会抛出异常）
   */
  public next(exception: Error, host: ArgumentsHost): Promise<any> {
    const result = this.invokeCustomFilters(exception, host);
    if (result) {
      return result;
    }
    return super.catch(exception, host);
  }

  /**
   * 设置路由级自定义过滤器列表（由 ExternalExceptionFilterContext 注入）。
   * @param filters - 编译后的过滤器元数据数组
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
   * @param host - ArgumentsHost，传递给过滤器的上下文
   * @returns 命中过滤器时的执行结果；无命中时返回 null
   */
  public invokeCustomFilters<T = any>(
    exception: T,
    host: ArgumentsHost,
  ): Promise<any> | null {
    if (isEmpty(this.filters)) {
      return null;
    }

    // 从过滤器列表中选出 @Catch 声明可捕获该异常的过滤器
    const filter = selectExceptionFilterMetadata(this.filters, exception);
    return filter ? filter.func(exception, host) : null;
  }
}
