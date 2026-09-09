import { PIPES_METADATA } from '@nestjs/common/constants';
import { Controller, PipeTransform, Type } from '@nestjs/common/interfaces';
import { isEmpty, isFunction } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { ApplicationConfig } from '../application-config';
import { ContextCreator } from '../helpers/context-creator';
import { STATIC_CONTEXT } from '../injector/constants';
import { NestContainer } from '../injector/container';
import { InstanceWrapper } from '../injector/instance-wrapper';

/**
 * 管道上下文创建器（Pipes Context Creator）：在路由处理器被调用前，
 * 负责解析并实例化应该作用于各参数的全部管道。
 *
 * 在框架中的角色：继承通用的 ContextCreator，按"方法级 -> 类级"的顺序
 * 读取 @UsePipes 元数据（PIPES_METADATA），结合全局管道（含请求作用域的
 * 全局管道）从容器中取出实际实例，最终交给 PipesConsumer 执行。
 */
export class PipesContextCreator extends ContextCreator {
  /** 当前请求所处理的目标模块 token，用于在容器中定位模块。 */
  private moduleContext: string;

  /**
   * @param container - 应用 IoC 容器，用于查找管道实例。
   * @param config - 应用配置，用于获取全局管道列表。
   */
  constructor(
    private readonly container: NestContainer,
    private readonly config?: ApplicationConfig,
  ) {
    super();
  }

  /**
   * 为指定的 controller 方法创建管道实例数组（方法级 + 类级）。
   *
   * @param instance - controller 实例。
   * @param callback - 处理器方法。
   * @param moduleKey - 该 controller 所在模块的 token。
   * @param contextId - 请求上下文 id（请求作用域实例按此区分）。
   * @param inquirerId - 请求发起者 id（用于 DURABLE 作用域）。
   * @returns 按执行顺序排列的管道实例数组。
   */
  public create(
    instance: Controller,
    callback: (...args: unknown[]) => unknown,
    moduleKey: string,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): PipeTransform[] {
    this.moduleContext = moduleKey;
    return this.createContext(
      instance,
      callback,
      PIPES_METADATA,
      contextId,
      inquirerId,
    );
  }

  /**
   * 将 @UsePipes 元数据（类引用或带 transform 的对象）解析为
   * 实际的管道实例数组：过滤无效项，逐个从容器取实例，并确保
   * 实例上确实定义了 transform 方法。
   *
   * @param metadata - 管道元数据数组。
   * @param contextId - 请求上下文 id。
   * @param inquirerId - 请求发起者 id。
   * @returns 解析后的管道实例数组。
   */
  public createConcreteContext<T extends any[], R extends any[]>(
    metadata: T,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): R {
    if (isEmpty(metadata)) {
      return [] as any[] as R;
    }
    return iterate(metadata)
      .filter((pipe: any) => pipe && (pipe.name || pipe.transform))
      .map(pipe => this.getPipeInstance(pipe, contextId, inquirerId))
      .filter(pipe => !!pipe && pipe.transform && isFunction(pipe.transform))
      .toArray() as R;
  }

  /**
   * 获取单个管道的实例：
   * 1. 若元数据本身是带 transform 方法的对象（函数式管道），直接返回；
   * 2. 否则视为类引用，从当前模块的 injectables 集合中解析出实例。
   *
   * @param pipe - 管道类引用或管道对象。
   * @param contextId - 请求上下文 id。
   * @param inquirerId - 请求发起者 id。
   * @returns 管道实例；无法解析时返回 null。
   */
  public getPipeInstance(
    pipe: Function | PipeTransform,
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): PipeTransform | null {
    const isObject = !!(pipe as PipeTransform).transform;
    if (isObject) {
      return pipe as PipeTransform;
    }
    const instanceWrapper = this.getInstanceByMetatype(pipe as Type<unknown>);
    if (!instanceWrapper) {
      return null;
    }
    const instanceHost = instanceWrapper.getInstanceByContextId(
      this.getContextId(contextId, instanceWrapper),
      inquirerId,
    );
    return instanceHost && instanceHost.instance;
  }

  /**
   * 按类引用在当前模块的 injectables 集合中查找管道的实例包装器。
   *
   * @param metatype - 管道类引用。
   * @returns 对应的实例包装器；未找到时返回 undefined。
   */
  public getInstanceByMetatype(
    metatype: Type<unknown>,
  ): InstanceWrapper | undefined {
    if (!this.moduleContext) {
      return;
    }
    const collection = this.container.getModules();
    const moduleRef = collection.get(this.moduleContext);
    if (!moduleRef) {
      return;
    }
    return moduleRef.injectables.get(metatype);
  }

  /**
   * 获取全局管道元数据：
   * 1. 静态上下文且无 inquirer 时，直接返回 app.useGlobalPipes 注册的全局管道；
   * 2. 否则追加请求作用域（REQUEST/DURABLE）的全局管道，并按当前上下文 id 解析实例。
   *
   * @param contextId - 请求上下文 id。
   * @param inquirerId - 请求发起者 id。
   * @returns 全局（含请求作用域）管道的元数据/实例数组。
   */
  public getGlobalMetadata<T extends unknown[]>(
    contextId = STATIC_CONTEXT,
    inquirerId?: string,
  ): T {
    if (!this.config) {
      return [] as unknown[] as T;
    }
    const globalPipes = this.config.getGlobalPipes() as T;
    if (contextId === STATIC_CONTEXT && !inquirerId) {
      return globalPipes;
    }
    const scopedPipeWrappers =
      this.config.getGlobalRequestPipes() as InstanceWrapper[];
    const scopedPipes = iterate(scopedPipeWrappers)
      .map(wrapper =>
        wrapper.getInstanceByContextId(
          this.getContextId(contextId, wrapper),
          inquirerId,
        ),
      )
      .filter(host => !!host)
      .map(host => host.instance)
      .toArray();

    return globalPipes.concat(scopedPipes) as T;
  }

  /**
   * 设置当前的目标模块上下文（模块 token）。
   *
   * @param context - 模块 token。
   */
  public setModuleContext(context: string) {
    this.moduleContext = context;
  }
}
