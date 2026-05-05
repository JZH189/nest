import { Type } from '../index';
import { ArgumentsHost } from './arguments-host.interface';

/**
 * 描述当前请求管道详情的接口。
 *
 * @see [执行上下文](https://docs.nestjs.cn/guards#execution-context)
 *
 * @publicApi
 */
export interface ExecutionContext extends ArgumentsHost {
  /**
   * 返回当前处理程序所属的控制器类的*类型*。
   */
  getClass<T = any>(): Type<T>;
  /**
   * 返回将在请求管道中接下来调用的处理程序（方法）的引用。
   */
  getHandler(): Function;
}
