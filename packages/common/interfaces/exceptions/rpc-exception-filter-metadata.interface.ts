import { RpcExceptionFilter } from './rpc-exception-filter.interface';
import { Type } from '../type.interface';

/**
 * RPC（微服务）异常过滤器的元数据描述，由容器收集，
 * 供微服务上下文中的异常处理代理按异常类型挑选并调用过滤器。
 */
export interface RpcExceptionFilterMetadata {
  /** 过滤器的 `catch` 方法引用 */
  func: RpcExceptionFilter['catch'];
  /** 该过滤器声明处理的异常类型列表 */
  exceptionMetatypes: Type<any>[];
}
