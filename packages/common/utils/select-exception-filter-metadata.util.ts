import { ExceptionFilterMetadata } from '../interfaces/exceptions';

/**
 * 从异常过滤器元数据列表中，选出第一个能处理给定异常的过滤器元数据。
 *
 * 匹配规则：若过滤器未声明任何异常类型（exceptionMetatypes 为空），
 * 则视为可捕获所有异常；否则要求至少声明的一种异常元类型是
 * 当前异常实例的祖先类型（通过 instanceof 判断）。
 * 异常处理层用它按注册顺序挑选合适的异常过滤器执行。
 *
 * @param filters 候选异常过滤器元数据列表（按注册顺序）
 * @param exception 待处理的异常实例
 * @returns 第一个匹配的过滤器元数据；若都不匹配则返回 undefined
 */
export const selectExceptionFilterMetadata = <T = any>(
  filters: ExceptionFilterMetadata[],
  exception: T,
): ExceptionFilterMetadata | undefined =>
  filters.find(
    ({ exceptionMetatypes }) =>
      // 未声明异常类型的过滤器可以捕获一切异常
      !exceptionMetatypes.length ||
      exceptionMetatypes.some(
        ExceptionMetaType => exception instanceof ExceptionMetaType,
      ),
  );
