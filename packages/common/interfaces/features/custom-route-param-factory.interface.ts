import { ExecutionContext } from './execution-context.interface';

/**
 * 自定义路由参数工厂的类型。配合 `createParamDecorator()` 使用，
 * 由路由参数工厂在请求时调用，把装饰器传入的 data 与执行上下文映射为注入到处理方法的参数值。
 *
 * @publicApi
 */
export type CustomParamFactory<TData = any, TOutput = any> = (
  data: TData,
  context: ExecutionContext,
) => TOutput;
