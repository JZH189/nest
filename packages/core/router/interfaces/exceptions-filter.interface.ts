import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { ExceptionsHandler } from '../../exceptions/exceptions-handler';
import { ContextId } from '../../injector/instance-wrapper';

/**
 * 异常过滤器工厂的接口定义。
 *
 * 在框架中的角色：路由子系统在注册路由时（见 RoutesResolver / RouterProxy）需要为每个
 * 控制器方法创建一个异常处理器（ExceptionsHandler），并把全局及控制器/方法级别绑定的
 * 异常过滤器挂载上去。实现该接口的类（RouterExceptionFilters）负责收集这些过滤器
 * 并构建最终的异常处理链。
 */
export interface ExceptionsFilter {
  create(
    instance: Controller,
    callback: Function,
    module: string,
    contextId?: ContextId,
    inquirerId?: string,
  ): ExceptionsHandler;
}
