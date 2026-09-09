import { ExceptionFilter } from './exception-filter.interface';
import { Type } from '../type.interface';

/**
 * 异常过滤器的元数据描述，由容器在实例化过滤器后收集，
 * 供核心包中的异常过滤器代理（ExceptionsHandler）按异常类型挑选并调用过滤器。
 */
export interface ExceptionFilterMetadata {
  /** 过滤器的 `catch` 方法引用 */
  func: ExceptionFilter['catch'];
  /** 该过滤器声明处理的异常类型列表 */
  exceptionMetatypes: Type<any>[];
}
