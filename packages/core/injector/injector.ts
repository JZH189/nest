import {
  InjectionToken,
  Logger,
  LoggerService,
  OptionalFactoryDependency,
} from '@nestjs/common';
import {
  OPTIONAL_DEPS_METADATA,
  OPTIONAL_PROPERTY_DEPS_METADATA,
  PARAMTYPES_METADATA,
  PROPERTY_DEPS_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants';
import {
  Controller,
  ForwardReference,
  Injectable,
  Type,
} from '@nestjs/common/interfaces';
import { clc } from '@nestjs/common/utils/cli-colors.util';
import {
  isFunction,
  isNil,
  isObject,
  isString,
  isSymbol,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { performance } from 'perf_hooks';
import { CircularDependencyException } from '../errors/exceptions';
import { RuntimeException } from '../errors/exceptions/runtime.exception';
import { UndefinedDependencyException } from '../errors/exceptions/undefined-dependency.exception';
import { UnknownDependenciesException } from '../errors/exceptions/unknown-dependencies.exception';
import { Barrier } from '../helpers/barrier';
import { STATIC_CONTEXT } from './constants';
import { INQUIRER } from './inquirer';
import {
  ContextId,
  InstancePerContext,
  InstanceWrapper,
  PropertyMetadata,
} from './instance-wrapper';
import { Module } from './module';
import { SettlementSignal } from './settlement-signal';

/**
 * 可注入依赖的类型
 */
export type InjectorDependency = InjectionToken;

/**
 * 基于属性的依赖
 */
export interface PropertyDependency {
  key: symbol | string;
  name: InjectorDependency;
  isOptional?: boolean;
  instance?: any;
}

/**
 * 依赖注入的上下文
 */
export interface InjectorDependencyContext {
  /**
   * 属性键的名称（基于属性的注入）
   */
  key?: string | symbol;
  /**
   * 函数本身、函数名称或注入令牌
   */
  name?: Function | string | symbol;
  /**
   * 从依赖数组中注入的依赖索引
   */
  index?: number;
  /**
   * 被注入的依赖数组
   */
  dependencies?: InjectorDependency[];
}

/**
 * 依赖注入器（Injector）
 *
 * 负责实例化和注入 NestJS 应用中的所有依赖。
 *
 * 主要职责：
 * 1. **实例化类**：根据依赖关系图实例化 providers、controllers、injectables
 * 2. **解析依赖**：处理构造函数参数、属性注入
 * 3. **循环依赖检测**：检测并处理循环依赖情况
 * 4. **作用域管理**：处理 SINGLETON、REQUEST、TRANSIENT 作用域
 *
 * 核心方法：
 * - loadProvider()      加载 Provider
 * - loadController()    加载 Controller
 * - loadInjectable()    加载 Injectable
 * - loadInstance()       实例化单个依赖
 * - resolveConstructorParams() 解析构造函数参数
 * - resolveProperties()  解析属性注入
 *
 * @example
 * ```typescript
 * const injector = new Injector();
 * await injector.loadProvider(wrapper, moduleRef);
 * ```
 */
export class Injector {
  private logger: LoggerService = new Logger('InjectorLogger');
  private readonly instanceDecorator: (target: unknown) => unknown = (
    target: unknown,
  ) => target;

  constructor(
    private readonly options?: {
      /**
       * 是否启用预览模式。
       */
      preview: boolean;
      /**
       * 用于装饰新创建实例的函数。
       */
      instanceDecorator?: (target: unknown) => unknown;
    },
  ) {
    if (options?.instanceDecorator) {
      this.instanceDecorator = options.instanceDecorator;
    }
  }

  /**
   * 预创建实例原型：为指定 wrapper 创建一个只挂了原型链的"空壳"实例，
   * 并替换集合中该 token 对应的 wrapper（预览模式/提前暴露实例时使用）。
   *
   * @param wrapper - 目标实例包装器
   * @param collection - wrapper 所在的登记表
   * @param contextId - 请求上下文 ID
   */
  public loadPrototype<T>(
    { token }: InstanceWrapper<T>,
    collection: Map<InjectionToken, InstanceWrapper<T>>,
    contextId = STATIC_CONTEXT,
  ) {
    if (!collection) {
      return;
    }
    const target = collection.get(token)!;
    const instance = target.createPrototype(contextId);
    if (instance) {
      const wrapper = new InstanceWrapper({
        ...target,
        instance,
      });
      collection.set(token, wrapper);
    }
  }

  /**
   * 加载（实例化）单个实例 —— DI 实例化的主入口
   *
   * 处理流程：
   * 1. 取出当前上下文下的实例记录（instanceHost），若已有挂起的实例化 Promise：
   *    - 存在循环依赖（settlementSignal 判定）时抛出 CircularDependencyException
   *    - 否则等待完成中的 donePromise（并发请求共享同一次实例化）
   * 2. 挂载 SettlementSignal（完成信号），并从集合中取出目标 wrapper
   * 3. 已解析则直接完成信号返回
   * 4. 否则依次执行：解析构造参数 -> 解析属性依赖 -> 实例化类 -> 应用属性注入，
   *    并记录初始化耗时、完成信号
   * 5. 失败时移除该上下文的实例记录、标记信号错误并向上抛出
   *
   * @param wrapper - 待实例化的实例包装器
   * @param collection - wrapper 所在的登记表（providers/controllers/injectables）
   * @param moduleRef - 宿主模块
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者（发起依赖请求的宿主 wrapper）
   */
  public async loadInstance<T>(
    wrapper: InstanceWrapper<T>,
    collection: Map<InjectionToken, InstanceWrapper>,
    moduleRef: Module,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
  ) {
    const inquirerId = this.getInquirerId(inquirer);
    const instanceHost = wrapper.getInstanceByContextId(
      this.getContextId(contextId, wrapper),
      inquirerId,
    );

    if (instanceHost.isPending) {
      const settlementSignal = wrapper.settlementSignal;
      if (inquirer && settlementSignal?.isCycle(inquirer.id)) {
        throw new CircularDependencyException(`"${wrapper.name}"`);
      }

      return instanceHost.donePromise!.then((err?: unknown) => {
        if (err) {
          throw err;
        }
      });
    }

    const settlementSignal = this.applySettlementSignal(instanceHost, wrapper);
    const token = wrapper.token || wrapper.name;

    const { inject } = wrapper;
    const targetWrapper = collection.get(token);
    if (isUndefined(targetWrapper)) {
      throw new RuntimeException();
    }
    if (instanceHost.isResolved) {
      return settlementSignal.complete();
    }
    try {
      const t0 = this.getNowTimestamp();
      const callback = async (instances: unknown[]) => {
        const properties = await this.resolveProperties(
          wrapper,
          moduleRef,
          inject as InjectionToken[],
          contextId,
          wrapper,
          inquirer,
        );
        const instance = await this.instantiateClass(
          instances,
          wrapper,
          targetWrapper,
          contextId,
          inquirer,
        );
        this.applyProperties(instance, properties);
        wrapper.initTime = this.getNowTimestamp() - t0;
        settlementSignal.complete();
      };
      await this.resolveConstructorParams<T>(
        wrapper,
        moduleRef,
        inject as InjectionToken[],
        callback,
        contextId,
        wrapper,
        inquirer,
      );
    } catch (err) {
      wrapper.removeInstanceByContextId(
        this.getContextId(contextId, wrapper),
        inquirerId,
      );

      settlementSignal.error(err);
      throw err;
    }
  }

  /**
   * 加载中间件：先为目标 wrapper 写入一个原型空壳实例（供路由提前引用），
   * 再复用 loadInstance 完成真正的实例化。
   *
   * @param wrapper - 中间件的实例包装器
   * @param collection - 中间件登记表
   * @param moduleRef - 宿主模块
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   */
  public async loadMiddleware(
    wrapper: InstanceWrapper,
    collection: Map<InjectionToken, InstanceWrapper>,
    moduleRef: Module,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
  ) {
    const { metatype, token } = wrapper;
    const targetWrapper = collection.get(token)!;
    if (!isUndefined(targetWrapper.instance)) {
      return;
    }
    targetWrapper.instance = Object.create(metatype!.prototype);
    await this.loadInstance(
      wrapper,
      collection,
      moduleRef,
      contextId,
      inquirer || wrapper,
    );
  }

  /**
   * 加载 controller：实例化 controller 本身，
   * 然后加载其元数据中记录的所有增强器（guard/interceptor/pipe/filter）。
   *
   * @param wrapper - controller 的实例包装器
   * @param moduleRef - 宿主模块
   * @param contextId - 请求上下文 ID
   */
  public async loadController(
    wrapper: InstanceWrapper<Controller>,
    moduleRef: Module,
    contextId = STATIC_CONTEXT,
  ) {
    const controllers = moduleRef.controllers;
    await this.loadInstance<Controller>(
      wrapper,
      controllers,
      moduleRef,
      contextId,
      wrapper,
    );
    await this.loadEnhancersPerContext(wrapper, contextId, wrapper);
  }

  /**
   * 加载增强器类可注入对象（guard/interceptor/pipe/filter）
   *
   * @param wrapper - 增强器的实例包装器
   * @param moduleRef - 宿主模块
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   */
  public async loadInjectable<T = any>(
    wrapper: InstanceWrapper<T>,
    moduleRef: Module,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
  ) {
    const injectables = moduleRef.injectables;
    await this.loadInstance<T>(
      wrapper,
      injectables,
      moduleRef,
      contextId,
      inquirer,
    );
  }

  /**
   * 加载 provider：实例化 provider 本身，
   * 然后加载其上应用的增强器（如使用 @UseGuards 的 provider）。
   *
   * @param wrapper - provider 的实例包装器
   * @param moduleRef - 宿主模块
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   */
  public async loadProvider(
    wrapper: InstanceWrapper<Injectable>,
    moduleRef: Module,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
  ) {
    const providers = moduleRef.providers;
    await this.loadInstance<Injectable>(
      wrapper,
      providers,
      moduleRef,
      contextId,
      inquirer,
    );
    await this.loadEnhancersPerContext(wrapper, contextId, wrapper);
  }

  /**
   * 为实例记录挂载完成信号（SettlementSignal）：
   * - donePromise：供并发请求等待同一次实例化
   * - isPending：标记实例化进行中
   *
   * @param instancePerContext - 上下文实例记录
   * @param host - 宿主实例包装器
   * @returns 新创建的完成信号
   */
  public applySettlementSignal<T>(
    instancePerContext: InstancePerContext<T>,
    host: InstanceWrapper<T>,
  ) {
    const settlementSignal = new SettlementSignal();
    instancePerContext.donePromise = settlementSignal.asPromise();
    instancePerContext.isPending = true;
    host.settlementSignal = settlementSignal;

    return settlementSignal;
  }

  /**
   * 解析构造函数参数（DI 的核心步骤之一）
   *
   * 处理流程：
   * 1. 请求作用域下若已有缓存的构造参数元数据，直接按元数据加载并回调
   * 2. 读取依赖列表：工厂 provider 取 inject 数组，普通类取反射元数据
   * 3. 创建参数屏障（Barrier），并行解析每个参数：
   *    - 参数为 INQUIRER 标识时直接返回父询问者实例
   *    - transient 询问者需要继承父询问者（保证延迟到请求时才解析）
   *    - resolveSingleParam 找到参数 wrapper，屏障同步后由 resolveComponentHost
   *      触发其递归实例化，取回最终实例
   *    - 任一参数未真正解析（非 forwardRef）时标记 isResolved = false
   *    - 失败且参数为 @Optional 时回退为 undefined
   * 4. 全部解析成功后以参数数组执行回调（完成实例化）
   *
   * @param wrapper - 待实例化的包装器
   * @param moduleRef - 宿主模块
   * @param inject - 工厂 provider 的依赖列表（普通类为 undefined）
   * @param callback - 参数解析完成后的回调（接收实例数组）
   * @param contextId - 请求上下文 ID
   * @param inquirer - 当前询问者
   * @param parentInquirer - 父级询问者（嵌套 transient / INQUIRER 场景）
   */
  public async resolveConstructorParams<T>(
    wrapper: InstanceWrapper<T>,
    moduleRef: Module,
    inject: InjectorDependency[] | undefined,
    callback: (args: unknown[]) => void | Promise<void>,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
    parentInquirer?: InstanceWrapper,
  ) {
    const metadata = wrapper.getCtorMetadata();

    if (metadata && contextId !== STATIC_CONTEXT) {
      const deps = await this.loadCtorMetadata(
        metadata,
        contextId,
        inquirer,
        parentInquirer,
      );
      return callback(deps);
    }

    const isFactoryProvider = !isNil(inject);
    const [dependencies, optionalDependenciesIds] = isFactoryProvider
      ? this.getFactoryProviderDependencies(wrapper)
      : this.getClassDependencies(wrapper);

    const paramBarrier = new Barrier(dependencies.length);
    let isResolved = true;
    const resolveParam = async (param: unknown, index: number) => {
      try {
        if (this.isInquirer(param, parentInquirer)) {
        /*
         * 向屏障发送信号以确保其他依赖不会永远等待。
         */
          paramBarrier.signal();

          return parentInquirer && parentInquirer.instance;
        }
        if (inquirer?.isTransient && parentInquirer) {
          // 当 `inquirer` 也是 transient 时，继承父级询问者
          // 这是必需的，以确保 transient providers 仅在请求时才解析
          inquirer.attachRootInquirer(parentInquirer);
        }
        const paramWrapper = await this.resolveSingleParam<T>(
          wrapper,
          param as Type | string | symbol,
          { index, dependencies },
          moduleRef,
          contextId,
          inquirer,
          index,
        );

        /*
         * 确保在此点之前所有实例包装器都已解析，否则 `wrapper` 的依赖树
         * 静态性可能被错误评估，导致 undefined / null 注入。
         */
        await paramBarrier.signalAndWait();

        const effectiveInquirer = this.getEffectiveInquirer(
          paramWrapper,
          inquirer,
          parentInquirer,
          contextId,
        );
        const paramWrapperWithInstance = await this.resolveComponentHost(
          moduleRef,
          paramWrapper,
          contextId,
          effectiveInquirer,
        );
        const instanceHost = paramWrapperWithInstance.getInstanceByContextId(
          this.getContextId(contextId, paramWrapperWithInstance),
          this.getInquirerId(effectiveInquirer),
        );
        if (!instanceHost.isResolved && !paramWrapperWithInstance.forwardRef) {
          isResolved = false;
        }
        return instanceHost?.instance;
      } catch (err) {
        /*
         * 向屏障发送信号以确保其他依赖不会永远等待。
         * 我们不在乎这是否发生在 `try` 块中的 `Barrier.signalAndWait()` 之后，
         * 因为屏障在那时总是会被解析。
         */
        paramBarrier.signal();

        const isOptional = optionalDependenciesIds.includes(index);
        if (!isOptional) {
          throw err;
        }
        return undefined;
      }
    };
    const instances = await Promise.all(dependencies.map(resolveParam));
    isResolved && (await callback(instances));
  }

  /**
   * 获取类 provider 的构造依赖列表与可选依赖下标
   *
   * @param wrapper - 类 provider 的实例包装器
   * @returns [依赖 token 数组, 可选依赖参数下标数组]
   */
  public getClassDependencies<T>(
    wrapper: InstanceWrapper<T>,
  ): [InjectorDependency[], number[]] {
    const ctorRef = wrapper.metatype as Type<any>;
    return [
      this.reflectConstructorParams(ctorRef),
      this.reflectOptionalParams(ctorRef),
    ];
  }

  /**
   * 获取工厂 provider 的依赖列表与可选依赖下标
   * （inject 数组中形如 { token, optional } 的项会被展开，optional 项记录下标）
   *
   * @param wrapper - 工厂 provider 的实例包装器
   * @returns [依赖 token 数组, 可选依赖下标数组]
   */
  public getFactoryProviderDependencies<T>(
    wrapper: InstanceWrapper<T>,
  ): [InjectorDependency[], number[]] {
    const optionalDependenciesIds: number[] = [];

    /**
     * 与 `@nestjs/common` 中的内部工具函数 `isOptionalFactoryDependency` 相同。
     * 我们在这里重复定义是因为那个函数不应该被导出。
     */
    function isOptionalFactoryDependency(
      value: InjectionToken | OptionalFactoryDependency,
    ): value is OptionalFactoryDependency {
      return (
        !isUndefined((value as OptionalFactoryDependency).token) &&
        !isUndefined((value as OptionalFactoryDependency).optional) &&
        !(value as any).prototype
      );
    }

    const mapFactoryProviderInjectArray = (
      item: InjectionToken | OptionalFactoryDependency,
      index: number,
    ): InjectionToken => {
      if (typeof item !== 'object') {
        return item;
      }
      if (isOptionalFactoryDependency(item)) {
        if (item.optional) {
          optionalDependenciesIds.push(index);
        }
        return item?.token;
      }
      return item;
    };
    return [
      wrapper.inject?.map?.(mapFactoryProviderInjectArray) as any[],
      optionalDependenciesIds,
    ];
  }

  /**
   * 反射读取类的构造参数类型元数据，
   * 并用 @Inject 自声明的依赖（SELF_DECLARED_DEPS_METADATA）覆盖对应下标。
   *
   * @param type - 目标类
   * @returns 构造参数类型/token 数组
   */
  public reflectConstructorParams<T>(type: Type<T>): any[] {
    const paramtypes = [
      ...(Reflect.getMetadata(PARAMTYPES_METADATA, type) || []),
    ];
    const selfParams = this.reflectSelfParams<T>(type);

    selfParams.forEach(({ index, param }) => (paramtypes[index] = param));
    return Array.from(paramtypes);
  }

  /** 反射读取 @Optional 标记的构造参数下标列表 */
  public reflectOptionalParams<T>(type: Type<T>): any[] {
    return Reflect.getMetadata(OPTIONAL_DEPS_METADATA, type) || [];
  }

  /** 反射读取 @Inject 自声明的依赖元数据（参数下标 + token） */
  public reflectSelfParams<T>(type: Type<T>): any[] {
    return Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, type) || [];
  }

  /**
   * 解析单个依赖参数：token 未定义时抛出 UndefinedDependencyException
   * （常见于循环导入），否则解析 token 并查找对应的组件包装器。
   *
   * @param wrapper - 依赖方（宿主）的实例包装器
   * @param param - 依赖 token（类/字符串/Symbol）
   * @param dependencyContext - 依赖上下文（用于错误信息定位）
   * @param moduleRef - 宿主模块
   * @param contextId - 请求上下文 ID
   * @param inquirer - 当前询问者
   * @param keyOrIndex - 参数下标或属性键
   * @returns 依赖对应的实例包装器
   */
  public async resolveSingleParam<T>(
    wrapper: InstanceWrapper<T>,
    param: Type<any> | string | symbol,
    dependencyContext: InjectorDependencyContext,
    moduleRef: Module,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
    keyOrIndex?: symbol | string | number,
  ) {
    if (isUndefined(param)) {
      this.logger.log(
        'Nest encountered an undefined dependency. This may be due to a circular import or a missing dependency declaration.',
      );
      throw new UndefinedDependencyException(
        wrapper.name,
        dependencyContext,
        moduleRef,
      );
    }
    const token = this.resolveParamToken(wrapper, param);
    return this.resolveComponentWrapper(
      moduleRef,
      token,
      dependencyContext,
      wrapper,
      contextId,
      inquirer,
      keyOrIndex,
    );
  }

  /**
   * 解析参数 token：forwardRef 包装的依赖会被解包（调用 forwardRef()），
   * 并在宿主 wrapper 上标记 forwardRef = true（循环引用延迟解析用）。
   *
   * @param wrapper - 依赖方的实例包装器
   * @param param - 参数（可能是 ForwardReference）
   * @returns 真实的注入 token
   */
  public resolveParamToken<T>(
    wrapper: InstanceWrapper<T>,
    param: Type<any> | string | symbol | ForwardReference,
  ) {
    if (typeof param === 'object' && 'forwardRef' in param) {
      wrapper.forwardRef = true;
      return param.forwardRef();
    }
    return param;
  }

  /**
   * 解析依赖对应的组件包装器：先打印调试日志，
   * 然后在宿主模块的 providers 表中查找该 token（lookupComponent）。
   *
   * @param moduleRef - 宿主模块
   * @param token - 依赖注入 token
   * @param dependencyContext - 依赖上下文
   * @param wrapper - 依赖方的实例包装器
   * @param contextId - 请求上下文 ID
   * @param inquirer - 当前询问者
   * @param keyOrIndex - 参数下标或属性键
   * @returns 依赖的实例包装器
   */
  public async resolveComponentWrapper<T>(
    moduleRef: Module,
    token: InjectionToken,
    dependencyContext: InjectorDependencyContext,
    wrapper: InstanceWrapper<T>,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
    keyOrIndex?: symbol | string | number,
  ): Promise<InstanceWrapper> {
    this.printResolvingDependenciesLog(token, inquirer);
    this.printLookingForProviderLog(token, moduleRef);
    const providers = moduleRef.providers;
    return this.lookupComponent(
      providers,
      moduleRef,
      { ...dependencyContext, name: token },
      wrapper,
      contextId,
      inquirer,
      keyOrIndex,
    );
  }

  /**
   * 解析依赖组件的"宿主"：确保依赖 wrapper 在当前上下文中被真正实例化
   *
   * 处理流程：
   * 1. 实例未解析且非 forwardRef：先在询问者的信号中登记依赖引用（循环检测用），
   *    然后递归调用 loadProvider 触发依赖的实例化
   * 2. 未解析但是 forwardRef（请求/transient 作用域间的循环依赖）：
   *    异步等待 donePromise 后再加载，使惰性创建的实例与预创建的原型合并
   * 3. 异步 provider（值是 Promise）：等待 Promise 完成并回写实例
   *
   * @param moduleRef - 宿主模块
   * @param instanceWrapper - 依赖的实例包装器
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   * @returns 依赖的实例包装器（其实例此时应已可用）
   */
  public async resolveComponentHost<T>(
    moduleRef: Module,
    instanceWrapper: InstanceWrapper<T | Promise<T>>,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
  ): Promise<InstanceWrapper> {
    const inquirerId = this.getInquirerId(inquirer);
    const instanceHost = instanceWrapper.getInstanceByContextId(
      this.getContextId(contextId, instanceWrapper),
      inquirerId,
    );
    if (!instanceHost.isResolved && !instanceWrapper.forwardRef) {
      inquirer?.settlementSignal?.insertRef(instanceWrapper.id);

      await this.loadProvider(
        instanceWrapper,
        instanceWrapper.host ?? moduleRef,
        contextId,
        inquirer,
      );
    } else if (
      !instanceHost.isResolved &&
      instanceWrapper.forwardRef &&
      (contextId !== STATIC_CONTEXT || !!inquirerId)
    ) {
      /**
       * 当检测到 request/transient providers 之间的循环依赖时，
       * 我们必须异步解析特定 contextId 或 inquirer 的实例主机，
       * 以确保最终惰性创建的实例能够与预先实例化的原型合并。
       */
      instanceHost.donePromise &&
        void instanceHost.donePromise
          .then(() =>
            this.loadProvider(instanceWrapper, moduleRef, contextId, inquirer),
          )
          .catch(err => {
            instanceWrapper.settlementSignal?.error(err);
          });
    }
    if (instanceWrapper.async) {
      const host = instanceWrapper.getInstanceByContextId(
        this.getContextId(contextId, instanceWrapper),
        inquirerId,
      );
      host.instance = await host.instance;
      instanceWrapper.setInstanceByContextId(contextId, host, inquirerId);
    }
    return instanceWrapper;
  }

  /**
   * 在模块的 providers 表中查找依赖组件（依赖查找的第一站）
   *
   * 处理流程：
   * 1. 若依赖 token 与当前 wrapper 自身相同（自己注入自己），抛出循环依赖异常
   * 2. 本模块 providers 表命中：登记依赖元数据并返回
   * 3. 未命中：转向上层模块继续查找（lookupComponentInParentModules）
   *
   * @param providers - 宿主模块的 provider 表
   * @param moduleRef - 宿主模块
   * @param dependencyContext - 依赖上下文（含依赖 token）
   * @param wrapper - 依赖方的实例包装器
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   * @param keyOrIndex - 参数下标或属性键
   * @returns 依赖的实例包装器
   * @throws UnknownDependenciesException - 所有模块都找不到该依赖时抛出
   */
  public async lookupComponent<T = any>(
    providers: Map<Function | string | symbol, InstanceWrapper>,
    moduleRef: Module,
    dependencyContext: InjectorDependencyContext,
    wrapper: InstanceWrapper<T>,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
    keyOrIndex?: symbol | string | number,
  ): Promise<InstanceWrapper<T>> {
    const token = wrapper.token || wrapper.name;
    const { name } = dependencyContext;
    if (wrapper && token === name) {
      throw new UnknownDependenciesException(
        wrapper.name,
        dependencyContext,
        moduleRef,
        { id: wrapper.id },
      );
    }
    if (name && providers.has(name)) {
      const instanceWrapper = providers.get(name)!;
      this.printFoundInModuleLog(name, moduleRef);
      this.addDependencyMetadata(keyOrIndex!, wrapper, instanceWrapper);
      return instanceWrapper;
    }
    return this.lookupComponentInParentModules(
      dependencyContext,
      moduleRef,
      wrapper,
      contextId,
      inquirer,
      keyOrIndex,
    );
  }

  /**
   * 在父模块（imports）中查找依赖组件；
   * 全部查找失败时抛出 UnknownDependenciesException。
   *
   * @param dependencyContext - 依赖上下文
   * @param moduleRef - 当前模块
   * @param wrapper - 依赖方的实例包装器
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   * @param keyOrIndex - 参数下标或属性键
   * @returns 找到的实例包装器
   */
  public async lookupComponentInParentModules<T = any>(
    dependencyContext: InjectorDependencyContext,
    moduleRef: Module,
    wrapper: InstanceWrapper<T>,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
    keyOrIndex?: symbol | string | number,
  ) {
    const instanceWrapper = await this.lookupComponentInImports(
      moduleRef,
      dependencyContext.name!,
      wrapper,
      new Set<string>(),
      contextId,
      inquirer,
      keyOrIndex,
    );
    if (isNil(instanceWrapper)) {
      throw new UnknownDependenciesException(
        wrapper.name,
        dependencyContext,
        moduleRef,
        { id: wrapper.id },
      );
    }
    return instanceWrapper;
  }

  /**
   * 深度遍历导入模块图查找依赖 provider
   *
   * 处理流程：
   * 1. 取当前模块的导入集合；若处于"遍历中"（isTraversing），
   *    则只保留被显式导出（re-export）的子模块（保证导出可见性规则）
   * 2. 逐个访问未访问过的子模块（moduleRegistry 防环）：
   *    - 子模块导出且提供该 token：命中，登记依赖元数据；
   *      若其实例尚未解析则中断遍历（交给 resolveComponentHost 统一加载，
   *      避免错误评估依赖树静态性导致 undefined 注入）
   *    - 未命中：继续向子模块的导入递归查找
   *
   * @param moduleRef - 当前模块
   * @param name - 依赖 token
   * @param wrapper - 依赖方的实例包装器
   * @param moduleRegistry - 已访问模块 ID 集合（防循环遍历）
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   * @param keyOrIndex - 参数下标或属性键
   * @param isTraversing - 是否处于递归遍历中（启用导出可见性过滤）
   * @returns 找到的实例包装器；未找到返回 null
   */
  public async lookupComponentInImports(
    moduleRef: Module,
    name: InjectionToken,
    wrapper: InstanceWrapper,
    moduleRegistry: Set<string> = new Set<string>(),
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
    keyOrIndex?: symbol | string | number,
    isTraversing?: boolean,
  ): Promise<any> {
    let instanceWrapperRef: InstanceWrapper | null = null;
    const imports = moduleRef.imports || new Set<Module>();
    const identity = (item: any) => item;

    let children = [...imports.values()].filter(identity);
    if (isTraversing) {
      const contextModuleExports = moduleRef.exports;
      children = children.filter(child =>
        contextModuleExports.has(child.metatype),
      );
    }
    for (const relatedModule of children) {
      if (moduleRegistry.has(relatedModule.id)) {
        continue;
      }
      this.printLookingForProviderLog(name, relatedModule);
      moduleRegistry.add(relatedModule.id);

      const { providers, exports } = relatedModule;
      if (!exports.has(name) || !providers.has(name)) {
        const instanceRef = await this.lookupComponentInImports(
          relatedModule,
          name,
          wrapper,
          moduleRegistry,
          contextId,
          inquirer,
          keyOrIndex,
          true,
        );
        if (instanceRef) {
          this.addDependencyMetadata(keyOrIndex!, wrapper, instanceRef);
          return instanceRef;
        }
        continue;
      }
      this.printFoundInModuleLog(name, relatedModule);
      instanceWrapperRef = providers.get(name)!;
      this.addDependencyMetadata(keyOrIndex!, wrapper, instanceWrapperRef);

      const inquirerId = this.getInquirerId(inquirer);
      const instanceHost = instanceWrapperRef.getInstanceByContextId(
        this.getContextId(contextId, instanceWrapperRef),
        inquirerId,
      );
      if (!instanceHost.isResolved && !instanceWrapperRef.forwardRef) {
        /*
         * Provider 将在我们通过当前 Barrier 后不久在 resolveComponentHost() 中加载。
         * 我们不能在这里加载它，因为这样做可能会错误地评估依赖树的
         * 静态性并导致 undefined / null 注入。
         */
        break;
      }
    }
    return instanceWrapperRef;
  }

  /**
   * 解析属性注入依赖（@Inject 装饰在属性上的依赖）
   *
   * 处理流程与 resolveConstructorParams 类似：
   * 1. 工厂 provider（有 inject 列表）没有属性注入，直接返回空数组
   * 2. 请求作用域下已有缓存元数据时按元数据加载
   * 3. 否则反射读取属性依赖元数据，经屏障同步后并行解析各属性依赖，
   *    失败且为可选属性时回退 undefined
   *
   * @param wrapper - 依赖方的实例包装器
   * @param moduleRef - 宿主模块
   * @param inject - 工厂依赖列表（可选）
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   * @param parentInquirer - 父级询问者
   * @returns 属性依赖数组（含解析出的实例）
   */
  public async resolveProperties<T>(
    wrapper: InstanceWrapper<T>,
    moduleRef: Module,
    inject?: InjectorDependency[],
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
    parentInquirer?: InstanceWrapper,
  ): Promise<PropertyDependency[]> {
    if (!isNil(inject)) {
      return [];
    }
    const metadata = wrapper.getPropertiesMetadata();
    if (metadata && contextId !== STATIC_CONTEXT) {
      return this.loadPropertiesMetadata(metadata, contextId, inquirer);
    }
    const properties = this.reflectProperties(wrapper.metatype as Type<any>);
    const propertyBarrier = new Barrier(properties.length);
    const instances = await Promise.all(
      properties.map(async (item: PropertyDependency) => {
        try {
          const dependencyContext = {
            key: item.key,
            name: item.name as Function | string | symbol,
          };
          if (this.isInquirer(item.name, parentInquirer)) {
            /*
             * 向屏障发送信号以确保其他依赖不会永远等待。
             */
            propertyBarrier.signal();

            return parentInquirer && parentInquirer.instance;
          }
          const paramWrapper = await this.resolveSingleParam<T>(
            wrapper,
            item.name as string,
            dependencyContext,
            moduleRef,
            contextId,
            inquirer,
            item.key,
          );

          /*
           * 确保在此点之前所有实例包装器都已解析，否则 `wrapper` 的依赖树
           * 静态性可能被错误评估，导致 undefined / null 注入。
           */
          await propertyBarrier.signalAndWait();

          const effectivePropertyInquirer = this.getEffectiveInquirer(
            paramWrapper,
            inquirer,
            parentInquirer,
            contextId,
          );
          const paramWrapperWithInstance = await this.resolveComponentHost(
            moduleRef,
            paramWrapper,
            contextId,
            effectivePropertyInquirer,
          );
          if (!paramWrapperWithInstance) {
            return undefined;
          }
          const instanceHost = paramWrapperWithInstance.getInstanceByContextId(
            this.getContextId(contextId, paramWrapperWithInstance),
            this.getInquirerId(effectivePropertyInquirer),
          );
          return instanceHost.instance;
        } catch (err) {
          /*
           * Signal the barrier to make sure other dependencies do not get stuck waiting forever. We
           * 我们不在乎这是否发生在 `try` 块中的 `Barrier.signalAndWait()` 之后，
           * 因为屏障在那时总是会被解析。
           */
          propertyBarrier.signal();

          if (!item.isOptional) {
            throw err;
          }
          return undefined;
        }
      }),
    );
    return properties.map((item: PropertyDependency, index: number) => ({
      ...item,
      instance: instances[index],
    }));
  }

  /**
   * 反射读取类的属性注入元数据（PROPERTY_DEPS_METADATA），
   * 并标记哪些属性为可选（OPTIONAL_PROPERTY_DEPS_METADATA）。
   *
   * @param type - 目标类
   * @returns 属性依赖元数据数组
   */
  public reflectProperties<T>(type: Type<T>): PropertyDependency[] {
    const properties = Reflect.getMetadata(PROPERTY_DEPS_METADATA, type) || [];
    const optionalKeys: string[] =
      Reflect.getMetadata(OPTIONAL_PROPERTY_DEPS_METADATA, type) || [];

    return properties.map((item: any) => ({
      ...item,
      name: item.type,
      isOptional: optionalKeys.includes(item.key),
    }));
  }

  /**
   * 将解析好的属性依赖实例赋值到实例对象的对应属性上
   *
   * @param instance - 目标实例
   * @param properties - 属性依赖数组（含已解析的实例）
   */
  public applyProperties<T = any>(
    instance: T,
    properties: PropertyDependency[],
  ): void {
    if (!isObject(instance)) {
      return undefined;
    }
    iterate(properties)
      .filter(item => !isNil(item.instance))
      .forEach(item => (instance[item.key] = item.instance));
  }

  /**
   * 实例化类（真正调用构造函数 / 工厂函数的一步）
   *
   * 处理流程：
   * 1. 判断实例是否需要在当前上下文中创建（isInContext）：
   *    静态、请求作用域、惰性 transient 或被显式请求
   * 2. 预览模式且宿主模块未开启 initOnPreview：跳过实例化，仅标记已解析
   * 3. 非工厂且在上下文中：new 调用构造函数（forwardRef 时与预创建的
   *    原型实例 Object.assign 合并），经过 instanceDecorator 装饰并记录
   *    isConstructorCalled
   * 4. 工厂 provider：调用工厂函数并等待异步结果
   * 5. 最终标记 isResolved 并返回实例
   *
   * @param instances - 已解析的构造参数实例数组
   * @param wrapper - 被实例化的包装器
   * @param targetMetatype - 集合中的目标包装器（承载实例缓存）
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   * @returns 创建（或复用）的实例
   */
  public async instantiateClass<T = any>(
    instances: any[],
    wrapper: InstanceWrapper,
    targetMetatype: InstanceWrapper,
    contextId = STATIC_CONTEXT,
    inquirer?: InstanceWrapper,
  ): Promise<T> {
    const { metatype, inject } = wrapper;
    const inquirerId = this.getInquirerId(inquirer);
    const instanceHost = targetMetatype.getInstanceByContextId(
      this.getContextId(contextId, targetMetatype),
      inquirerId,
    );
    const isInContext =
      wrapper.isStatic(contextId, inquirer) ||
      wrapper.isInRequestScope(contextId, inquirer) ||
      wrapper.isLazyTransient(contextId, inquirer) ||
      wrapper.isExplicitlyRequested(contextId, inquirer);

    if (this.options?.preview && !wrapper.host?.initOnPreview) {
      instanceHost.isResolved = true;
      return instanceHost.instance;
    }

    if (isNil(inject) && isInContext) {
      instanceHost.instance = wrapper.forwardRef
        ? Object.assign(
            instanceHost.instance,
            new (metatype as Type<any>)(...instances),
          )
        : new (metatype as Type<any>)(...instances);

      instanceHost.instance = this.instanceDecorator(instanceHost.instance);
      instanceHost.isConstructorCalled = true;
    } else if (isInContext) {
      const factoryReturnValue = (targetMetatype.metatype as any as Function)(
        ...instances,
      );
      instanceHost.instance = await factoryReturnValue;
      instanceHost.instance = this.instanceDecorator(instanceHost.instance);
      instanceHost.isConstructorCalled = true;
    }
    instanceHost.isResolved = true;
    return instanceHost.instance;
  }

  /**
   * 在指定请求上下文中加载实例（请求作用域运行时解析入口，
   * 如 Provider 在请求中被 ModuleRef.resolve 触发时）
   *
   * @param instance - 现有实例（用于反查其构造 token 对应的 wrapper）
   * @param moduleRef - 宿主模块
   * @param collection - wrapper 登记表
   * @param ctx - 请求上下文 ID
   * @param wrapper - 可选的实例包装器（未传则按实例构造函数查找）
   * @returns 该上下文下的实例
   */
  public async loadPerContext<T = any>(
    instance: T,
    moduleRef: Module,
    collection: Map<InjectionToken, InstanceWrapper>,
    ctx: ContextId,
    wrapper?: InstanceWrapper,
  ): Promise<T> {
    if (!wrapper) {
      const injectionToken = (instance as any).constructor!;
      wrapper = collection.get(injectionToken);
    }
    await this.loadInstance(wrapper!, collection, moduleRef, ctx, wrapper);
    await this.loadEnhancersPerContext(wrapper!, ctx, wrapper);

    const host = wrapper!.getInstanceByContextId(
      this.getContextId(ctx, wrapper!),
      wrapper!.id,
    );
    return host && (host.instance as T);
  }

  /**
   * 在指定上下文中加载实例的所有增强器（guard/interceptor 等）
   *
   * @param wrapper - 宿主实例包装器
   * @param ctx - 请求上下文 ID
   * @param inquirer - 询问者
   */
  public async loadEnhancersPerContext(
    wrapper: InstanceWrapper,
    ctx: ContextId,
    inquirer?: InstanceWrapper,
  ) {
    const enhancers = wrapper.getEnhancersMetadata() || [];
    const loadEnhancer = (item: InstanceWrapper) => {
      const hostModule = item.host!;
      return this.loadInstance(
        item,
        hostModule.injectables,
        hostModule,
        ctx,
        inquirer,
      );
    };
    await Promise.all(enhancers.map(loadEnhancer));
  }

  /**
   * 按缓存的构造参数元数据（请求作用域下复用）加载各依赖实例
   *
   * @param metadata - 构造参数依赖的包装器数组
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   * @param parentInquirer - 父级询问者
   * @returns 解析出的依赖实例数组
   */
  public async loadCtorMetadata(
    metadata: InstanceWrapper<any>[],
    contextId: ContextId,
    inquirer?: InstanceWrapper,
    parentInquirer?: InstanceWrapper,
  ): Promise<any[]> {
    const hosts: Array<InstanceWrapper<any> | undefined> = await Promise.all(
      metadata.map(async item =>
        this.resolveScopedComponentHost(
          item,
          contextId,
          inquirer,
          parentInquirer,
        ),
      ),
    );
    return hosts.map((item, index) => {
      const dependency = metadata[index];
      const effectiveInquirer = this.getEffectiveInquirer(
        dependency,
        inquirer,
        parentInquirer,
        contextId,
      );

      return item?.getInstanceByContextId(
        this.getContextId(contextId, item),
        this.getInquirerId(effectiveInquirer),
      ).instance;
    });
  }

  /**
   * 按缓存的属性依赖元数据（请求作用域下复用）加载各属性实例
   *
   * @param metadata - 属性依赖元数据数组
   * @param contextId - 请求上下文 ID
   * @param inquirer - 询问者
   * @returns 属性依赖数组（含解析出的实例）
   */
  public async loadPropertiesMetadata(
    metadata: PropertyMetadata[],
    contextId: ContextId,
    inquirer?: InstanceWrapper,
  ): Promise<PropertyDependency[]> {
    const dependenciesHosts = await Promise.all(
      metadata.map(async ({ wrapper: item, key }) => ({
        key,
        host: await this.resolveComponentHost(
          item.host!,
          item,
          contextId,
          inquirer,
        ),
      })),
    );
    const inquirerId = this.getInquirerId(inquirer);
    return dependenciesHosts.map(({ key, host }) => ({
      key,
      name: key,
      instance: host.getInstanceByContextId(
        this.getContextId(contextId, host),
        inquirerId,
      ).instance,
    }));
  }

  /** 获取询问者的唯一 ID（transient 实例分桶用）；无询问者时返回 undefined */
  private getInquirerId(
    inquirer: InstanceWrapper | undefined,
  ): string | undefined {
    return inquirer ? inquirer.id : undefined;
  }

  /**
   * 对于非静态上下文中的嵌套 TRANSIENT 依赖（TRANSIENT -> TRANSIENT），
   * 返回 parentInquirer 以确保每个父级 TRANSIENT 获取自己的实例。
   * 这是必需的，因为在 REQUEST/DURABLE 作用域中，
   * 同一个 TRANSIENT wrapper 可以被多个父级使用，
   * 导致嵌套的 TRANSIENT 被错误地共享。
   * 对于 non-TRANSIENT -> TRANSIENT，返回 inquirer（当前正在创建的 wrapper）。
   */
  private getEffectiveInquirer(
    dependency: InstanceWrapper | undefined,
    inquirer: InstanceWrapper | undefined,
    parentInquirer: InstanceWrapper | undefined,
    contextId: ContextId,
  ): InstanceWrapper | undefined {
    return dependency?.isTransient &&
      inquirer?.isTransient &&
      parentInquirer &&
      contextId !== STATIC_CONTEXT
      ? parentInquirer
      : inquirer;
  }

  /**
   * 解析作用域组件宿主（缓存的元数据路径使用）：
   * 参数是 INQUIRER 标识时直接返回父询问者，否则走 resolveComponentHost。
   */
  private resolveScopedComponentHost(
    item: InstanceWrapper,
    contextId: ContextId,
    inquirer?: InstanceWrapper,
    parentInquirer?: InstanceWrapper,
  ) {
    return this.isInquirerRequest(item, parentInquirer)
      ? parentInquirer
      : this.resolveComponentHost(
          item.host!,
          item,
          contextId,
          this.getEffectiveInquirer(item, inquirer, parentInquirer, contextId),
        );
  }

  /** 判断依赖是否为 INQUIRER 标识（transient 且有父询问者时成立） */
  private isInquirerRequest(
    item: InstanceWrapper,
    parentInquirer: InstanceWrapper | undefined,
  ) {
    return item.isTransient && item.name === INQUIRER && parentInquirer;
  }

  /** 判断参数是否为 INQUIRER token（且有父询问者可返回） */
  private isInquirer(
    param: unknown,
    parentInquirer: InstanceWrapper | undefined,
  ) {
    return param === INQUIRER && parentInquirer;
  }

  /**
   * 登记依赖元数据：字符串/Symbol 键记为属性依赖，数字记为构造参数依赖
   *
   * @param keyOrIndex - 参数下标或属性键
   * @param hostWrapper - 依赖方（宿主）包装器
   * @param instanceWrapper - 依赖的包装器
   */
  protected addDependencyMetadata(
    keyOrIndex: symbol | string | number,
    hostWrapper: InstanceWrapper,
    instanceWrapper: InstanceWrapper,
  ) {
    if (isSymbol(keyOrIndex) || isString(keyOrIndex)) {
      hostWrapper.addPropertiesMetadata(keyOrIndex, instanceWrapper);
    } else {
      hostWrapper.addCtorMetadata(keyOrIndex, instanceWrapper);
    }
  }

  /** 获取 token 的展示名（类取类名，字符串/Symbol 直接转字符串） */
  private getTokenName(token: InjectionToken): string {
    return isFunction(token) ? (token as Function).name : token.toString();
  }

  /** 调试日志：正在为某个 provider 解析依赖 */
  private printResolvingDependenciesLog(
    token: InjectionToken,
    inquirer?: InstanceWrapper,
  ): void {
    if (!this.isDebugMode()) {
      return;
    }
    const tokenName = this.getTokenName(token);
    const dependentName =
      (inquirer?.name && inquirer.name.toString?.()) ?? 'unknown';
    const isAlias = dependentName === tokenName;

    const messageToPrint = `Resolving dependency ${clc.cyanBright(
      tokenName,
    )}${clc.green(' in the ')}${clc.yellow(dependentName)}${clc.green(
      ` provider ${isAlias ? '(alias)' : ''}`,
    )}`;

    this.logger.log(messageToPrint);
  }

  /** 调试日志：正在某个模块中查找 provider */
  private printLookingForProviderLog(
    token: InjectionToken,
    moduleRef: Module,
  ): void {
    if (!this.isDebugMode()) {
      return;
    }
    const tokenName = this.getTokenName(token);
    const moduleRefName = moduleRef?.metatype?.name ?? 'unknown';
    this.logger.log(
      `Looking for ${clc.cyanBright(tokenName)}${clc.green(
        ' in ',
      )}${clc.magentaBright(moduleRefName)}`,
    );
  }

  /** 调试日志：在某个模块中找到了 provider */
  private printFoundInModuleLog(
    token: InjectionToken,
    moduleRef: Module,
  ): void {
    if (!this.isDebugMode()) {
      return;
    }
    const tokenName = this.getTokenName(token);
    const moduleRefName = moduleRef?.metatype?.name ?? 'unknown';
    this.logger.log(
      `Found ${clc.cyanBright(tokenName)}${clc.green(
        ' in ',
      )}${clc.magentaBright(moduleRefName)}`,
    );
  }

  /** 是否处于调试模式（由环境变量 NEST_DEBUG 控制） */
  private isDebugMode(): boolean {
    return !!process.env.NEST_DEBUG;
  }

  /**
   * 获取实际使用的上下文 ID：durable 实例会通过 contextId.getParent
   * 沿宿主链向上查找其所属的持久上下文（跨请求复用），其余直接透传。
   */
  private getContextId(
    contextId: ContextId,
    instanceWrapper: InstanceWrapper,
  ): ContextId {
    return contextId.getParent
      ? contextId.getParent({
          token: instanceWrapper.token,
          isTreeDurable: instanceWrapper.isDependencyTreeDurable(),
        })
      : contextId;
  }

  /** 获取当前高精度时间戳（用于统计实例初始化耗时） */
  private getNowTimestamp() {
    return performance.now();
  }
}
