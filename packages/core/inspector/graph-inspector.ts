import { UnknownDependenciesException } from '../errors/exceptions/unknown-dependencies.exception';
import { NestContainer } from '../injector/container';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';
import { DeterministicUuidRegistry } from './deterministic-uuid-registry';
import { EnhancerMetadataCacheEntry } from './interfaces/enhancer-metadata-cache-entry.interface';
import { Entrypoint } from './interfaces/entrypoint.interface';
import { OrphanedEnhancerDefinition } from './interfaces/extras.interface';
import { ClassNode, Node } from './interfaces/node.interface';
import { PartialGraphHost } from './partial-graph.host';
import { SerializedGraph } from './serialized-graph';

/**
 * 图检查器（Graph Inspector），NestJS 内省（introspection）机制的核心类。
 *
 * 负责在应用初始化阶段扫描 IoC 容器（NestContainer），将模块、
 * provider、controller、injectable（Guard/Interceptor/Pipe/Filter 等增强器）、
 * 模块间依赖关系、类之间注入关系等信息，逐条写入 SerializedGraph，
 * 最终生成一张可用于可视化的"依赖图 / 类图"（例如 NestJS CLI 的
 * `nest info` 或外部工具基于 `--graph` 输出渲染的图）。
 *
 * 在框架中的角色：由 InternalCoreModule 提供并被容器持有，
 * NestApplication 在初始化（init）流程中调用其 inspectModules 等方法
 * 完成整张图的构建。
 */
export class GraphInspector {
  /** 正在构建的序列化图（节点与边的最终载体）。 */
  private readonly graph: SerializedGraph;
  private readonly enhancersMetadataCache =
    new Array<EnhancerMetadataCacheEntry>();

  /**
   * @param container - 应用 IoC 容器，用于读取模块集合、动态模块元数据等，
   * 并获取其持有的序列化图实例。
   */
  constructor(private readonly container: NestContainer) {
    this.graph = container.serializedGraph;
  }

  /**
   * 检查（遍历）容器中的所有模块，构建图的主体结构。
   * 在应用初始化完成后由框架调用一次。
   *
   * @param modules - 待检查的模块表（模块 token -> Module 实例），
   * 默认取容器中的全部模块。
   */
  public inspectModules(
    modules: Map<string, Module> = this.container.getModules(),
  ) {
    for (const moduleRef of modules.values()) {
      // 1. 为每个模块插入模块节点及其包含的类节点（provider/controller/injectable）
      this.insertModuleNode(moduleRef);
      this.insertClassNodes(moduleRef);
      // 2. 插入该模块到其导入模块之间的"module-to-module"边
      this.insertModuleToModuleEdges(moduleRef);
    }

    // 3. 消费增强器（Guard/Interceptor/Pipe/Filter）元数据缓存，补插增强器相关的边
    this.enhancersMetadataCache.forEach(entry =>
      this.insertEnhancerEdge(entry),
    );

    // 4. 清空确定性 UUID 注册表，避免影响下一次构建
    DeterministicUuidRegistry.clear();
  }

  /**
   * 注册"部分图"状态：当应用初始化失败（如出现无法解析的依赖）时，
   * 将图状态标记为 partial，并记录失败原因（未知依赖的上下文等），
   * 便于后续生成部分依赖图辅助排错。
   *
   * @param error - 导致初始化失败的异常。
   */
  public registerPartial(error: unknown) {
    this.graph.status = 'partial';

    if (error instanceof UnknownDependenciesException) {
      this.graph.metadata = {
        cause: {
          type: 'unknown-dependencies',
          context: error.context,
          moduleId: error.moduleRef?.id,
          nodeId: error.metadata?.id,
        },
      };
    } else {
      this.graph.metadata = {
        cause: {
          type: 'unknown',
          error,
        },
      };
    }
    PartialGraphHost.register(this.graph);
  }

  /**
   * 检查一个实例包装器（InstanceWrapper），为其中的构造函数参数注入
   * 与属性注入建立"class-to-class"边（即类与类之间的依赖关系）。
   *
   * @param source - 被检查的实例包装器（依赖的持有方）。
   * @param moduleRef - 该实例所属的模块引用。
   */
  public inspectInstanceWrapper<T = any>(
    source: InstanceWrapper<T>,
    moduleRef: Module,
  ) {
    const ctorMetadata = source.getCtorMetadata();
    ctorMetadata?.forEach((target, index) =>
      this.insertClassToClassEdge(
        source,
        target,
        moduleRef,
        index,
        'constructor',
      ),
    );

    const propertiesMetadata = source.getPropertiesMetadata();
    propertiesMetadata?.forEach(({ key, wrapper: target }) =>
      this.insertClassToClassEdge(source, target, moduleRef, key, 'property'),
    );
  }

  /**
   * 将增强器（Guard/Interceptor/Pipe/Filter）的元数据缓存起来，
   * 待所有模块检查完毕后在 inspectModules 中统一插入增强器边
   * （因为增强器所附着的目标类可能尚未创建节点）。
   *
   * @param entry - 增强器元数据缓存条目。
   */
  public insertEnhancerMetadataCache(entry: EnhancerMetadataCacheEntry) {
    this.enhancersMetadataCache.push(entry);
  }

  /**
   * 插入"孤立增强器"节点：未被任何类实际使用（附着）的增强器定义，
   * 例如通过 app.useGlobalGuards 注册的全局增强器。
   *
   * @param entry - 孤立增强器定义。
   */
  public insertOrphanedEnhancer(entry: OrphanedEnhancerDefinition) {
    this.graph.insertOrphanedEnhancer({
      ...entry,
      ref: entry.ref?.constructor?.name ?? 'Object',
    });
  }

  /**
   * 插入"已附着增强器"节点：当某个增强器实例被至少一个类使用时，
   * 将其对应节点标记为 global（全局），并记录为已附着状态。
   *
   * @param wrapper - 增强器实例的包装器。
   */
  public insertAttachedEnhancer(wrapper: InstanceWrapper) {
    const existingNode = this.graph.getNodeById(wrapper.id)!;
    existingNode.metadata.global = true;

    this.graph.insertAttachedEnhancer(existingNode.id);
  }

  /**
   * 插入入口点（Entrypoint）定义：即路由处理器方法（HTTP 的 controller
   * 方法、微消息/GraphQL 等的处理器），作为图的入口节点挂到其所属类节点下。
   *
   * @param definition - 入口点定义（类节点 id、方法名等元信息）。
   * @param parentId - 入口点所属的父节点（类节点）id。
   */
  public insertEntrypointDefinition<T>(
    definition: Entrypoint<T>,
    parentId: string,
  ) {
    definition = {
      ...definition,
      id: `${definition.classNodeId}_${definition.methodName}`,
    };
    this.graph.insertEntrypoint(definition, parentId);
  }

  /**
   * 插入一个类节点（provider / injectable / controller 等非模块类型）。
   *
   * @param moduleRef - 该类所属的模块引用。
   * @param wrapper - 该类的实例包装器（包含 id、token、作用域等元信息）。
   * @param type - 节点类型（'provider' | 'injectable' | 'controller' 等）。
   */
  public insertClassNode(
    moduleRef: Module,
    wrapper: InstanceWrapper,
    type: Exclude<Node['metadata']['type'], 'module'>,
  ) {
    this.graph.insertNode({
      id: wrapper.id,
      label: wrapper.name,
      parent: moduleRef.id,
      metadata: {
        type,
        internal: wrapper.metatype === moduleRef.metatype,
        sourceModuleName: moduleRef.name,
        durable: wrapper.isDependencyTreeDurable(),
        static: wrapper.isDependencyTreeStatic(),
        scope: wrapper.scope!,
        transient: wrapper.isTransient,
        exported: moduleRef.exports.has(wrapper.token),
        token: wrapper.token,
        subtype: wrapper.subtype,
        initTime: wrapper.initTime!,
      },
    });
  }

  /**
   * 插入模块节点：根据模块引用与动态模块元数据构建节点信息。
   *
   * @param moduleRef - 模块引用。
   */
  private insertModuleNode(moduleRef: Module) {
    const dynamicMetadata = this.container.getDynamicMetadataByToken(
      moduleRef.token,
    );
    const node: Node = {
      id: moduleRef.id,
      label: moduleRef.name,
      metadata: {
        type: 'module',
        global: moduleRef.isGlobal,
        dynamic: !!dynamicMetadata,
        internal: moduleRef.name === 'InternalCoreModule',
      },
    };
    this.graph.insertNode(node);
  }

  /**
   * 插入模块间的导入关系边（source 模块 imports target 模块）。
   *
   * @param moduleRef - 作为边起点的模块引用（其 imports 集合为目标）。
   */
  private insertModuleToModuleEdges(moduleRef: Module) {
    for (const targetModuleRef of moduleRef.imports) {
      this.graph.insertEdge({
        source: moduleRef.id,
        target: targetModuleRef.id,
        metadata: {
          type: 'module-to-module',
          sourceModuleName: moduleRef.name,
          targetModuleName: targetModuleRef.name,
        },
      });
    }
  }

  /**
   * 将缓存的增强器元数据落盘为图结构：为增强器实例插入 class-to-class
   * 边（decorator 类型注入），并在目标类节点的 metadata.enhancers 中登记。
   *
   * @param entry - 增强器元数据缓存条目（含目标类、增强器引用、方法键等）。
   */
  private insertEnhancerEdge(entry: EnhancerMetadataCacheEntry) {
    const moduleRef = this.container.getModuleByKey(entry.moduleToken)!;
    const sourceInstanceWrapper =
      moduleRef.controllers.get(entry.classRef) ??
      moduleRef.providers.get(entry.classRef)!;
    const existingSourceNode = this.graph.getNodeById(
      sourceInstanceWrapper.id,
    ) as ClassNode;
    const enhancers = existingSourceNode.metadata.enhancers ?? [];

    if (entry.enhancerInstanceWrapper) {
      this.insertClassToClassEdge(
        sourceInstanceWrapper,
        entry.enhancerInstanceWrapper,
        moduleRef,
        undefined,
        'decorator',
      );

      enhancers.push({
        id: entry.enhancerInstanceWrapper.id,
        methodKey: entry.methodKey,
        subtype: entry.subtype,
      });
    } else {
      const name =
        entry.enhancerRef!.constructor?.name ??
        (entry.enhancerRef as Function).name;

      enhancers.push({
        name,
        methodKey: entry.methodKey,
        subtype: entry.subtype,
      });
    }
    existingSourceNode.metadata.enhancers = enhancers;
  }

  /**
   * 插入类与类之间的依赖边（构造函数注入 / 属性注入 / 装饰器注入）。
   *
   * @param source - 依赖持有方的实例包装器。
   * @param target - 被注入方的实例包装器。
   * @param moduleRef - source 所在的模块引用。
   * @param keyOrIndex - 注入位置：属性名为 symbol/string，构造参数为索引，否则 undefined。
   * @param injectionType - 注入类型：'constructor' | 'property' | 'decorator'。
   */
  private insertClassToClassEdge<T>(
    source: InstanceWrapper<T>,
    target: InstanceWrapper,
    moduleRef: Module,
    keyOrIndex: number | string | symbol | undefined,
    injectionType: 'constructor' | 'property' | 'decorator',
  ) {
    this.graph.insertEdge({
      source: source.id,
      target: target.id,
      metadata: {
        type: 'class-to-class',
        sourceModuleName: moduleRef.name,
        sourceClassName: source.name,
        targetClassName: target.name,
        sourceClassToken: source.token,
        targetClassToken: target.token,
        targetModuleName: target.host?.name as string,
        keyOrIndex,
        injectionType,
      },
    });
  }

  /**
   * 插入一个模块内的全部类节点：依次遍历 providers、injectables、controllers。
   *
   * @param moduleRef - 模块引用。
   */
  private insertClassNodes(moduleRef: Module) {
    moduleRef.providers.forEach(value =>
      this.insertClassNode(moduleRef, value, 'provider'),
    );
    moduleRef.injectables.forEach(value =>
      this.insertClassNode(moduleRef, value, 'injectable'),
    );
    moduleRef.controllers.forEach(value =>
      this.insertClassNode(moduleRef, value, 'controller'),
    );
  }
}
