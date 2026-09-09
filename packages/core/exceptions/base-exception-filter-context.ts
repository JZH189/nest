import { FILTER_CATCH_EXCEPTIONS } from '@nestjs/common/constants';
import { Type } from '@nestjs/common/interfaces';
import { ExceptionFilter } from '@nestjs/common/interfaces/exceptions/exception-filter.interface';
import { isEmpty, isFunction } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { ContextCreator } from '../helpers/context-creator';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { InstanceWrapper } from '../injector/instance-wrapper';

/**
 * 异常过滤器上下文创建器基类。
 *
 * 继承自 helpers/context-creator 中的 ContextCreator，负责把路由上通过
 * @UseFilters() 声明的异常过滤器元数据，编译成“可执行的过滤器上下文”：
 * 即 [{ func, exceptionMetatypes }] 数组，其中 func 是绑定好实例的 catch 方法，
 * exceptionMetatypes 是该过滤器声明要捕获的异常类型列表。
 *
 * 在框架中的角色：ExceptionsHandler / ExternalExceptionsHandler 在构造时会
 * 持有一个本类（或其子类）实例，用于在请求触发异常时查找并调用匹配的过滤器。
 * 子类 BaseExceptionFilterContext 与 ExternalExceptionFilterContext 的差异
 * 仅在于实例解析方式（普通注入的过滤器类 vs 外部上下文中的过滤器）。
 */
export class BaseExceptionFilterContext extends ContextCreator {
  protected moduleContext: string;

  constructor(private readonly container: NestContainer) {
    super();
  }

  /**
   * 将过滤器元数据编译为具体的过滤器上下文数组。
   * @param metadata - 通过装饰器收集到的过滤器实例/类数组
   * @param contextId - 请求上下文 ID（用于请求级作用域实例解析），默认为静态上下文
   * @param inquirerId - 请求发起者的 ID（用于请求级瞬态实例解析）
   * @returns 形如 [{ func, exceptionMetatypes }] 的过滤器上下文数组
   */
  public createConcreteContext<T extends any[], R extends any[]>(
    metadata: T,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): R {
    // 过滤器列表为空则直接返回空上下文，避免后续开销
    if (isEmpty(metadata)) {
      return [] as any[] as R;
    }
    return iterate(metadata)
      .filter(
        instance => instance && (isFunction(instance.catch) || instance.name),
      )
      .map(filter => this.getFilterInstance(filter, contextId, inquirerId))
      .filter(item => !!item)
      .map(instance => ({
        // 1. 把 catch 方法绑定到过滤器实例上，之后可直接调用
        // 2. 通过反射读取该过滤器 @Catch() 声明的异常类型元数据
        func: instance!.catch.bind(instance),
        exceptionMetatypes: this.reflectCatchExceptions(instance!),
      }))
      .toArray() as R;
  }

  /**
   * 根据传入的过滤器（实例或类）解析出真正的过滤器实例。
   * @param filter - 过滤器，可能是已实例化的对象（带 catch 方法），也可能是需要从 DI 容器解析的类
   * @param contextId - 请求上下文 ID，用于解析请求级作用域的实例
   * @param inquirerId - 请求发起者 ID，用于解析瞬态作用域的实例
   * @returns 解析出的过滤器实例；无法解析时返回 null
   */
  public getFilterInstance(
    filter: Function | ExceptionFilter,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): ExceptionFilter | null {
    // 如果传入的是带 catch 方法的对象，说明已经是实例，直接返回
    const isObject = !!(filter as ExceptionFilter).catch;
    if (isObject) {
      return filter as ExceptionFilter;
    }
    // 否则按“类”处理，从模块的可注入集合中解析对应实例
    const instanceWrapper = this.getInstanceByMetatype(filter as Type<unknown>);
    if (!instanceWrapper) {
      return null;
    }
    // 依据上下文 ID 取出对应作用域（静态/请求级）下的实例宿主
    const instanceHost = instanceWrapper.getInstanceByContextId(
      this.getContextId(contextId, instanceWrapper),
      inquirerId,
    );
    return instanceHost && instanceHost.instance;
  }

  /**
   * 按类的元类型（构造函数）从当前模块中查找对应的实例包装器。
   * @param metatype - 过滤器类的构造函数
   * @returns 找到的 InstanceWrapper；当前无模块上下文或未注册时返回 undefined
   */
  public getInstanceByMetatype(
    metatype: Type<unknown>,
  ): InstanceWrapper | undefined {
    if (!this.moduleContext) {
      return;
    }
    // 从容器中取出当前模块，再在其可注入集合中查找该类
    const collection = this.container.getModules();
    const moduleRef = collection.get(this.moduleContext);
    if (!moduleRef) {
      return;
    }
    return moduleRef.injectables.get(metatype);
  }

  /**
   * 通过反射读取过滤器实例上 @Catch() 声明捕获的异常类型列表。
   * 元数据键为 FILTER_CATCH_EXCEPTIONS，读取位置是实例原型的构造函数。
   * @param instance - 过滤器实例
   * @returns 该过滤器声明捕获的异常类型数组；未声明时返回空数组
   */
  public reflectCatchExceptions(instance: ExceptionFilter): Type<any>[] {
    const prototype = Object.getPrototypeOf(instance);
    return (
      Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, prototype.constructor) || []
    );
  }
}
