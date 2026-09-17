/* =========================================================================
 * NestJS 源码架构探索 · 内容数据
 * 节点=源码中真实存在的 class/接口组/装饰器组；内容依据 packages/（v11.1.19）源码整理。
 * 字段：id/kind/name/pkg/path/cat/summary/design[]/members[[名,说明]]/catsApp/seeAlso[]/snippet
 * ========================================================================= */
window.__NEST_ARCH_DATA__ = {
  meta: {
    title: 'NestJS 源码架构探索',
    entry: 'sample/01-cats-app',
    baseline: 'packages/* @ 11.1.19（本仓库源码）',
  },

  nodes: [
    /* ================= @nestjs/core · 启动与应用 ================= */
    {
      id: 'NestFactoryStatic', kind: 'class', name: 'NestFactoryStatic', pkg: '@nestjs/core',
      path: 'packages/core/nest-factory.ts', cat: ['bootstrap'],
      summary: '应用入口工厂：装配容器/扫描器/加载器，创建并初始化应用（导出单例 NestFactory）',
      design: [
        '解决"用户只想写一个 AppModule，框架要完成一切装配"的问题。create() 是唯一入口，内部按固定次序完成：创建 ApplicationConfig（全局配置仓库）与 NestContainer（IoC 容器）→ 构造 DependenciesScanner 并 scan(module)（模块树入容器）→ InstanceLoader.createInstancesOfDependencies()（实例化全部 provider）→ new NestApplication(...) 返回。装配流程被固化在这一个地方，用户完全不需要知道这些组件的存在。',
        '平台解耦的关键手法是"懒加载适配器"：不直接 import ExpressAdapter，而是通过 loadAdapter() 在运行时 require @nestjs/platform-express，装不上才告警。因此 @nestjs/core 不依赖任何具体 HTTP 平台，同一个入口可在 Express / Fastify 间切换。',
        '所有初始化代码都包裹在 ExceptionsZone.run()/asyncRun() 中：启动期异常与运行期隔离，统一经 ExceptionHandler 记录后终止进程，避免留下半启动状态的僵尸应用。',
      ],
      members: [
        ['create(module, serverOrOptions, options)', '创建 HTTP 应用（默认懒加载 Express 适配器）'],
        ['createApplicationContext(module)', '创建不监听端口的应用上下文（CLI/任务场景）'],
        ['createMicroservice(module, options)', '创建微服务应用'],
        ['loadAdapter(type, platformName)', '运行时加载并校验平台适配器'],
      ],
      catsApp: 'main.ts 里 const app = await NestFactory.create(AppModule) 调用的就是它；返回的 app 即 NestApplication 实例，后续 useGlobalPipes / listen 都落在它身上。',
      seeAlso: ['NestApplication', 'NestContainer', 'DependenciesScanner', 'ExpressAdapter', 'ExceptionsZone'],
      snippet: {
        code: '// create() 主流程（概念示意）\n' +
              'const applicationConfig = new ApplicationConfig();\n' +
              'const container = new NestContainer();\n' +
              'await ExceptionsZone.asyncRun(async () => {\n' +
              '  scanner.scan(module);                            // 模块树 → 容器\n' +
              '  await instanceLoader.createInstancesOfDependencies(); // 实例化\n' +
              '});\n' +
              'return new NestApplication(container, httpAdapter, config);',
      },
    },
    {
      id: 'NestApplication', kind: 'class', name: 'NestApplication', pkg: '@nestjs/core',
      path: 'packages/core/nest-application.ts', cat: ['bootstrap'],
      summary: 'HTTP 应用运行时门面：init/listen 生命周期、全局增强器登记入口（实现 INestApplication）',
      design: [
        '面向用户的运行时门面。main.ts 里 app.useGlobalPipes() / app.setGlobalPrefix() / app.listen() 调用的都是它。它本身几乎不干活，职责是"编排"：把每件事转交给正确的子系统。',
        'init() 是启动中段的总编排，次序即框架语义：注册 body 解析 → MiddlewareModule.register()（执行各模块 configure(consumer) 并挂载）→ RoutesResolver.resolve()（扫描控制器并把路由挂到适配器）→（可选）SocketModule / MicroservicesModule → 依次触发 onModuleInit / onApplicationBootstrap 钩子。"先中间件后路由"与 Express 的洋葱模型一致。',
        '全局增强器（pipes/guards/interceptors/filters）在这里只是"登记"进 ApplicationConfig；真正的收集与组装发生在每条路由的各 ContextCreator 中——登记与生效解耦，让全局/控制器/方法三级增强器共用同一套合并逻辑。继承 NestApplicationContext，因此 get/resolve/select 等上下文能力在 HTTP 应用上同样可用。',
      ],
      members: [
        ['init()', '中间件/路由/钩子的总编排'],
        ['listen(port)', '经适配器监听端口并打印 URL'],
        ['useGlobalPipes(...pipes)', '登记全局管道（写入 ApplicationConfig）'],
        ['registerHttpServer(adapter)', '把适配器写入 InternalProvidersStorage'],
        ['connectMicroservice(...)', '挂载微服务，形成混合应用'],
      ],
      catsApp: 'main.ts 的 app.useGlobalPipes(new ValidationPipe()) 与 app.listen(3000)；登记的管道最终由 PipesContextCreator 在每条路由上生效。',
      seeAlso: ['NestApplicationContext', 'ApplicationConfig', 'MiddlewareModule', 'RoutesResolver', 'ExpressAdapter'],
    },
    {
      id: 'NestApplicationContext', kind: 'class', name: 'NestApplicationContext', pkg: '@nestjs/core',
      path: 'packages/core/nest-application-context.ts', cat: ['bootstrap'],
      summary: '应用上下文基类：get/resolve 取实例、生命周期钩子编排、优雅关闭',
      design: [
        '把"一个跑起来的依赖注入容器"抽象为上下文：HTTP 应用（NestApplication）、微服务（NestMicroservice）、测试（TestingModule）都继承它——所以任何形态里都能 app.get(CatsService)。',
        '钩子编排是它的隐藏亮点：onModuleInit / onApplicationBootstrap / onModuleDestroy 的调用不按模块注册顺序，而按模块在依赖图中的"距离"（Module.distance，由 TopologyTree 计算）逐层触发，保证被依赖方先初始化、后销毁，次序是确定性的。',
        '优雅关闭：enableShutdownHooks() 之后监听 SIGTERM/SIGINT，先触发 BeforeApplicationShutdown / OnApplicationShutdown 钩子再关闭适配器。select(module) 还能切出某个子模块的独立上下文。',
      ],
      members: [
        ['get(typeOrToken)', '从容器解析实例'],
        ['resolve(typeOrToken, contextId)', '解析请求作用域实例'],
        ['select(module)', '切出子模块上下文'],
        ['close()', '销毁实例并触发关闭钩子'],
        ['enableShutdownHooks()', '监听 SIGTERM/SIGINT'],
      ],
      catsApp: '示例未直接使用钩子，但 app.get()/app.select() 能用正是继承自它；关闭信号（Ctrl+C）的钩子清理也在此。',
      seeAlso: ['NestApplication', 'ModuleRef', 'AbstractInstanceResolver', 'TopologyTree', 'hooks-functions'],
    },
    {
      id: 'ApplicationConfig', kind: 'class', name: 'ApplicationConfig', pkg: '@nestjs/core',
      path: 'packages/core/application-config.ts', cat: ['bootstrap'],
      summary: '全局配置仓库：全局前缀/版本化/四类全局增强器列表（纯状态持有者）',
      design: [
        '纯状态仓库（data holder），没有任何行为分支：globalPipes / globalFilters / globalGuards / globalInterceptors 四个列表，加上全局路由前缀、版本化策略、WebSocket 适配器等应用级约定。刻意与 NestContainer 分离——容器管"模块内有什么"，config 管"应用级约定"，两者正交。',
        '增强器列表同时接受"实例"（app.useGlobalPipes(new ValidationPipe())）与请求作用域的 InstanceWrapper（APP_* token 注入的那类），供各 ContextCreator 组装每条路由管道时做三级合并（全局→控制器→方法）。',
      ],
      members: [
        ['globalPipes / globalGuards / ...', '四类全局增强器存储'],
        ['setGlobalPrefix(prefix)', '全局路由前缀'],
        ['setVersioning(options)', 'URI / Header / 媒体类型版本化'],
      ],
      catsApp: 'main.ts 的 useGlobalPipes 写入 globalPipes；core.module.ts 的 APP_INTERCEPTOR 经扫描器汇入 globalInterceptors——两条路径最终都汇到这里。',
      seeAlso: ['NestApplication', 'DependenciesScanner', 'PipesContextCreator', 'InterceptorsContextCreator'],
    },
    {
      id: 'ExceptionsZone', kind: 'class', name: 'ExceptionsZone', pkg: '@nestjs/core',
      path: 'packages/core/errors/exceptions-zone.ts', cat: ['exception'],
      summary: '启动期异常隔离区：兜底记录并终止进程',
      design: [
        '静态工具类。run()/asyncRun() 把整个初始化过程包进隔离区：模块扫描/实例化阶段的任何异常都会被 ExceptionHandler 记录，随后 flush 日志并 teardown（默认 process.exit(1)）。目的：启动失败时不留半初始化的僵尸进程，异常也不会被吞掉。',
        '另有 ignoreStaticErrors 变体，供 REPL / 依赖图预览（snapshot）场景带着错误继续运行。',
      ],
      members: [
        ['run(callback)', '同步隔离'],
        ['asyncRun(fn)', '异步隔离（NestFactory.create 使用）'],
      ],
      catsApp: '若 AppModule 的某个 import 写错（比如导入不存在的模块），你看到的启动报错与退出就是它的输出。',
      seeAlso: ['ExceptionHandler', 'NestFactoryStatic'],
    },
    {
      id: 'ExceptionHandler', kind: 'class', name: 'ExceptionHandler', pkg: '@nestjs/core',
      path: 'packages/core/errors/exception-handler.ts', cat: ['exception'],
      summary: '记录未捕获的启动异常（经 Logger 输出）',
      design: [
        '极简的"最后一人"：record(exception) 用 Logger 打印异常与堆栈。注意与请求期的 ExceptionsHandler（异常过滤器链）区分——那是 HTTP 语义的异常处理，这是进程语义的兜底。',
      ],
      catsApp: '启动失败时终端里的红色错误输出即出自它。',
      seeAlso: ['ExceptionsZone', 'ExceptionsHandler'],
    },

    /* ================= @nestjs/core · 注入器（容器/DI） ================= */
    {
      id: 'NestContainer', kind: 'class', name: 'NestContainer', pkg: '@nestjs/core',
      path: 'packages/core/injector/container.ts', cat: ['container'],
      summary: 'IoC 总账本：持有全部 Module、全局模块集合、内部存储与模块编译器',
      design: [
        '整个依赖注入的中枢。DependenciesScanner 把模块"记账"到这里（addModule），InstanceLoader 再从这里取模块去实例化——"先记账、后干活"的两段式贯穿 Nest 启动全程。它持有 ModulesContainer（token→Module 的 Map）、全局模块集合、动态模块元数据缓存、InternalProvidersStorage 与 ModuleCompiler。',
        'v11 的一个重要演进：模块唯一 token 的生成策略被抽象为 OpaqueKeyFactory 接口（ByReference / DeepHashed 两个实现），按 options 在构造时选择，编译逻辑（ModuleCompiler）不再关心 token 怎么来——用策略族替换了旧版 ModuleTokenFactory 的深序列化哈希。',
      ],
      members: [
        ['addModule(metatype, scope)', '登记模块（经 ModuleCompiler 编译）'],
        ['addProvider / addController / addInjectable', '把成员记入对应模块'],
        ['getModuleByKey(token)', '按 token 取模块'],
        ['addGlobalModule(module)', '标记全局模块'],
      ],
      catsApp: 'CatsModule / CoreModule / AppModule 以及框架自己的 InternalCoreModule，最终都作为条目存在这里。',
      seeAlso: ['ModulesContainer', 'Module', 'ModuleCompiler', 'DependenciesScanner', 'InstanceLoader'],
    },
    {
      id: 'ModulesContainer', kind: 'class', name: 'ModulesContainer', pkg: '@nestjs/core',
      path: 'packages/core/injector/modules-container.ts', cat: ['container'],
      summary: 'Map<token, Module> 模块注册表（+applicationId），一切"遍历所有模块"的起点',
      design: [
        '继承自 Map 的薄封装，额外携带 applicationId（应用实例 uid）。钩子调用、路由解析、DiscoveryService 等所有需要"遍历所有模块"的操作都从它出发。',
        '它还被注册为可注入 provider（由 InternalCoreModule 提供），所以生态库（如 @nestjs/config 的依赖查找）能直接注入 ModulesContainer 做模块级发现。',
      ],
      seeAlso: ['NestContainer', 'Module', 'InternalCoreModule'],
    },
    {
      id: 'Module', kind: 'class', name: 'Module', pkg: '@nestjs/core',
      path: 'packages/core/injector/module.ts', cat: ['container'],
      summary: '单模块运行时表示：providers/controllers/injectables/exports 全部包装为 InstanceWrapper',
      design: [
        '每个 @Module 类编译后对应一个 Module 实例。内部用四个 Map 管理 _providers、_controllers、_injectables（增强器）、_middlewares，值全部是 InstanceWrapper——"模块 = 一组同质的包装"，容器只需要跟 wrapper 打交道。',
        '构造时自动追加两个内部 provider：模块自身的 ModuleRef 与全局 ApplicationConfig——所以你在任何 provider 里都能直接注入 ModuleRef / ApplicationConfig。',
        'distance 记录它相对根模块的依赖距离（TopologyTree 计算），决定钩子调用次序；isGlobal 对应 @Global()；exports 集合决定哪些 provider 对外可见。',
      ],
      members: [
        ['providers / controllers / injectables', '三类成员的 Map<token, InstanceWrapper>'],
        ['addProvider / addController', '成员登记'],
        ['replace / relatedModules', '成员替换（@nestjs/testing 的 override 利用它）'],
        ['distance / isGlobal / token', '距离、全局标记、模块唯一键'],
      ],
      catsApp: 'CatsModule 编译后：providers 里有 CatsService 的 wrapper，controllers 里有 CatsController 的 wrapper，外加自动注入的 ModuleRef。',
      seeAlso: ['InstanceWrapper', 'NestContainer', 'ModuleCompiler', 'TopologyTree'],
    },
    {
      id: 'InstanceWrapper', kind: 'class', name: 'InstanceWrapper', pkg: '@nestjs/core',
      path: 'packages/core/injector/instance-wrapper.ts', cat: ['container'],
      summary: '单个 provider 的核心数据结构：元数据 + 按 ContextId 缓存的实例（作用域模型的基石）',
      design: [
        'DI 里最重要的数据结构：把"一个 provider 的一切"打包——token、metatype（类本身）、name、scope（DEFAULT / REQUEST / TRANSIENT）、durable 标志、依赖元数据，以及实例缓存 instances: WeakMap<ContextId, InstancePerContext>。',
        '实例为什么按 ContextId 缓存？DEFAULT 作用域全局只有一个 ContextId，而 REQUEST 作用域每个请求一个（async_hooks 生成）——同一个 wrapper 因此能同时服务单例与请求级两种语义，这是 Nest 作用域模型的实现基石。',
        'TRANSIENT 作用域再按 inquirer（注入发起方）分桶，保证每次注入都拿到独立实例。Injector 写实例、InstanceLinksHost 读它做索引，几乎所有注入相关组件都围着它转。',
      ],
      members: [
        ['setInstanceByContextId(ctxId, value)', '写入某上下文的实例'],
        ['getInstanceByContextId(ctxId)', '读取（必要时等待 pending Promise）'],
        ['scope / durable', '作用域；请求结束后是否保留实例'],
        ['metatype / token', '类本身与注入令牌'],
      ],
      catsApp: 'CatsService 的 wrapper：scope=DEFAULT、实例缓存里只有一个单例；CatsController 的 wrapper 同理。',
      seeAlso: ['Injector', 'Module', 'SettlementSignal', 'InstanceLinksHost'],
      snippet: {
        code: 'interface InstancePerContext {\n' +
              '  instance: any;             // 先放原型壳，再填真实实例\n' +
              '  isResolved: boolean;\n' +
              '  async?: Promise<unknown>;  // pending Promise：循环依赖等待用\n' +
              '}',
      },
    },
    {
      id: 'Injector', kind: 'class', name: 'Injector', pkg: '@nestjs/core',
      path: 'packages/core/injector/injector.ts', cat: ['container'],
      summary: '实例化引擎：解析构造参数/属性注入，处理作用域、循环依赖与可选依赖',
      design: [
        '真正 new 类的地方。loadProvider / loadController / loadInjectable / loadMiddleware 四个入口共享同一套路数：先放"原型壳"（保证循环引用时对象已存在）→ resolveConstructorParams 逐个解析构造参数（Reflect 设计元数据 + @Inject 覆盖 token + @Optional 容错）→ applyProperties 补属性注入。',
        '循环依赖的解法是 pending Promise：A 实例化到一半需要 B 时，拿到的是 B 的 wrapper 里注册的 SettlementSignal/async Promise；B 完成时 settle，A 继续赋值。配合 forwardRef 可支持"先声明后使用"。',
        '请求作用域通过 contextId + inquirer 参数化整个流程；preview 模式（依赖图快照）只解析依赖关系而不真正调用构造函数。',
      ],
      members: [
        ['loadProvider(wrapper, module)', '实例化一个 provider'],
        ['resolveConstructorParams(...)', '按设计元数据逐参解析'],
        ['loadMiddleware / loadInjectable', '中间件与增强器实例化入口'],
        ['resolveProperties(...)', '属性注入'],
      ],
      catsApp: 'CatsController 构造函数里的 private readonly catsService: CatsService —— 正是它通过类型元数据找到 CatsService 的 wrapper 并把单例注入进去。',
      seeAlso: ['InstanceWrapper', 'InstanceLoader', 'SettlementSignal', 'ModuleRef', 'MiddlewareResolver'],
      snippet: {
        code: 'resolveConstructorParams(metatype, targets, callback) {\n' +
              '  // 读取构造参数类型 + @Inject 覆盖 + @Optional 标记\n' +
              '  for (const [index, param] of params.entries()) {\n' +
              '    const instance = await this.resolveComponentInstance(...);\n' +
              '    callback(index, instance);   // 填回实参\n' +
              '  }\n' +
              '}',
      },
    },
    {
      id: 'SettlementSignal', kind: 'class', name: 'SettlementSignal', pkg: '@nestjs/core',
      path: 'packages/core/injector/settlement-signal.ts', cat: ['container'],
      summary: 'Promise 化的"实例就绪"信号——循环依赖等待的基石',
      design: [
        'wrap / settle 两件事：被依赖方尚未完成时，依赖方拿到的是它包出的 Promise；完成时唤醒所有等待者。这让"半成品实例"可以安全地被引用，真实值就位后由 async 赋值逻辑替换——是 Injector 破解循环依赖的关键构件。',
      ],
      seeAlso: ['Injector', 'InstanceWrapper'],
    },
    {
      id: 'InstanceLoader', kind: 'class', name: 'InstanceLoader', pkg: '@nestjs/core',
      path: 'packages/core/injector/instance-loader.ts', cat: ['container'],
      summary: '两阶段加载器：先铺原型壳，再并行实例化 providers→injectables→controllers',
      design: [
        '实例化阶段的总指挥。第一阶段把所有模块的所有 wrapper 先放上"原型壳"（partial instance），保证任何前向引用都有对象可指；第二阶段按 providers → injectables（增强器）→ controllers 的固定次序真正实例化，模块之间并行（Promise.all）。',
        '为什么 providers 先于 controllers？控制器依赖服务——固定次序让"被依赖者优先就绪"在绝大多数场景天然成立，剩下的循环情况交给 Injector 的 pending Promise。',
        '全程向 GraphInspector 汇报（依赖图快照 nest --tsc --graph 用）。',
      ],
      members: [
        ['createInstancesOfDependencies()', '两阶段总入口'],
        ['createInstancesOfProviders(modules)', '并行实例化 providers'],
      ],
      catsApp: 'CatsService 先于 CatsController 实例化，注入时 CatsService 已就绪——就是这次序的功劳。',
      seeAlso: ['Injector', 'Module', 'InstanceWrapper'],
    },
    {
      id: 'ModuleCompiler', kind: 'class', name: 'ModuleCompiler', pkg: '@nestjs/core',
      path: 'packages/core/injector/compiler.ts', cat: ['scan'],
      summary: '模块编译器：静态/动态/forwardRef 模块 → { type, token, dynamicMetadata }',
      design: [
        'scanner 每遇到一个 import 都交给它：普通类模块直接取类；DynamicModule 先展开并缓存其 dynamicMetadata（延迟 providers/imports）；ForwardReference 解包 forwardRef()。产出统一的三元组 { type, token, dynamicMetadata }。',
        'token 的生成委托给注入的 OpaqueKeyFactory —— 编译流程与 token 策略解耦，v11 用这一族策略替换了旧版 ModuleTokenFactory 的深序列化哈希。',
      ],
      seeAlso: ['ByReferenceModuleOpaqueKeyFactory', 'DeepHashedModuleOpaqueKeyFactory', 'NestContainer', 'DependenciesScanner'],
    },
    {
      id: 'ByReferenceModuleOpaqueKeyFactory', kind: 'class', name: 'ByReferenceModuleOpaqueKeyFactory', pkg: '@nestjs/core',
      path: 'packages/core/injector/opaque-key-factory/by-reference-module-opaque-key-factory.ts', cat: ['scan'],
      summary: '默认 token 策略：把模块 id 缓存在对象引用上（Symbol K_MODULE_ID）',
      design: [
        '默认策略：为每个模块对象生成一次 id 并用 Symbol 缓存在对象自身，同一引用永远同 token——快且稳定。另支持 random 与 shallow（sha256 快照哈希）模式，保证依赖图快照 / 预览模式下的跨进程确定性。',
        '局限：内容相同但引用不同的动态模块不会被去重——那正是 DeepHashed 策略存在的理由。',
      ],
      seeAlso: ['ModuleCompiler', 'DeepHashedModuleOpaqueKeyFactory'],
    },
    {
      id: 'DeepHashedModuleOpaqueKeyFactory', kind: 'class', name: 'DeepHashedModuleOpaqueKeyFactory', pkg: '@nestjs/core',
      path: 'packages/core/injector/opaque-key-factory/deep-hashed-module-opaque-key-factory.ts', cat: ['scan'],
      summary: '深哈希 token 策略：对"模块+动态元数据"整体 sha256，内容相同即同 token（自动去重）',
      design: [
        'moduleIdGeneratorAlgorithm: "deep-hash" 时启用：对模块 id + 名称 + 序列化的动态元数据整体做 sha256。效果：在不同文件里写了同样参数的动态模块（如 ConfigModule.forRoot({...同参})）会得到同一 token，被容器去重为单例——解决"同一配置模块被多处导入而重复实例化"的经典问题。',
      ],
      catsApp: '若你把 CoreModule 改写为 CoreModule.forRoot() 风格的动态模块并多处导入，两种 token 策略的行为差异就会显现。',
      seeAlso: ['ModuleCompiler', 'ByReferenceModuleOpaqueKeyFactory'],
    },
    {
      id: 'ModuleRef', kind: 'class', name: 'ModuleRef', pkg: '@nestjs/core',
      path: 'packages/core/injector/module-ref.ts', cat: ['container'],
      summary: '运行时注入 API 基类：get / resolve / create（每个模块绑定一个子类实例）',
      design: [
        '面向用户的"手动注入器"：get(token) 取实例、resolve(token, contextId) 解析请求作用域实例、create(Class) 临时 new 一个并自动注入其依赖。抽象类——Module 构造时为每个模块创建绑定子类，查找顺序：先本模块，再查其 imports 的导出链。',
        'introspect(token) 能拿到 wrapper 的 scope/durable 元数据；instantiateClass 走"一次性 InstanceWrapper + Injector"，保证手动创建的实例与容器语义完全一致。',
      ],
      members: [
        ['get / resolve', '同步取实例 / 按上下文解析'],
        ['create(type)', '即时实例化（含依赖注入）'],
        ['introspect(token)', '查看作用域元数据'],
      ],
      catsApp: '业务里 constructor(private moduleRef: ModuleRef) 即可动态取服务；本示例未直接使用，但它作为内部 provider 已注入每个模块。',
      seeAlso: ['AbstractInstanceResolver', 'Injector', 'InstanceLinksHost', 'Module'],
    },
    {
      id: 'AbstractInstanceResolver', kind: 'class', name: 'AbstractInstanceResolver', pkg: '@nestjs/core',
      path: 'packages/core/injector/abstract-instance-resolver.ts', cat: ['container'],
      summary: 'ModuleRef 与 ApplicationContext 共享的 find / resolvePerContext 查找算法',
      design: [
        '把"在 InstanceLinksHost 索引上按 token / contextId 查找实例"的公共算法抽象成抽象类：get / resolve 的真正实现在这里。NestApplicationContext 与 ModuleRef 两个门面复用同一套查找语义——用户不管从哪个入口拿实例，行为一致。',
      ],
      seeAlso: ['ModuleRef', 'NestApplicationContext', 'InstanceLinksHost'],
    },
    {
      id: 'InstanceLinksHost', kind: 'class', name: 'InstanceLinksHost', pkg: '@nestjs/core',
      path: 'packages/core/injector/instance-links-host.ts', cat: ['container'],
      summary: '全容器平铺索引：token → InstanceLink[]，把查找从"遍历模块"降为"一次命中"',
      design: [
        '启动时把所有模块的 providers/controllers/injectables 展开成 token → InstanceLink（含 wrapper 与所在模块）的 Map。get/resolve 的每次查找由"遍历模块树"降为一次 Map 命中；同一 token 在多个模块导出时会得到多个 link，按 strict / 非 strict 规则挑选。',
      ],
      seeAlso: ['ModuleRef', 'AbstractInstanceResolver', 'Module'],
    },
    {
      id: 'InternalProvidersStorage', kind: 'class', name: 'InternalProvidersStorage', pkg: '@nestjs/core',
      path: 'packages/core/injector/internal-providers-storage.ts', cat: ['container'],
      summary: '内部单例存储：HttpAdapterHost 与当前 HTTP 适配器',
      design: [
        '一个刻意为之的"小全局"：NestApplication 创建时把适配器写进来，让 InternalCoreModule 提供的 HttpAdapterHost 能注入到任意 provider（例如 BaseExceptionFilter 需要写响应），而不需要用户手工传递。setHttpAdapter 同时驱动 HttpAdapterHost 的 Observable 通知。',
      ],
      seeAlso: ['AbstractHttpAdapter', 'InternalCoreModule', 'BaseExceptionFilter'],
    },
    {
      id: 'LazyModuleLoader', kind: 'class', name: 'LazyModuleLoader', pkg: '@nestjs/core',
      path: 'packages/core/injector/lazy-module-loader/lazy-module-loader.ts', cat: ['container'],
      summary: '运行期按需加载模块（lazy modules），缩短冷启动',
      design: [
        'load(asyncImport) 时为懒模块走一遍"迷你启动"：DependenciesScanner.scanForModules({ lazy: true }) 进专用小容器，再用专属 Injector + InstanceLoader 实例化，返回该模块的 ModuleRef。适合按路由 / 按租户才加载的重组件。由 InternalCoreModuleFactory 注册为全局可注入 provider。',
      ],
      seeAlso: ['DependenciesScanner', 'InstanceLoader', 'ModuleRef', 'InternalCoreModule'],
    },
    {
      id: 'InternalCoreModule', kind: 'class', name: 'InternalCoreModule', pkg: '@nestjs/core',
      path: 'packages/core/injector/internal-core-module/internal-core-module.ts', cat: ['container'],
      summary: '框架自身的全局模块：提供 Reflector / ModuleRef / REQUEST / INQUIRER 等 provider',
      design: [
        '框架"用自己的 DI 服务自己"的载体：@Global() 的内部模块，最先被 scanner 注册。提供 Reflector（及字符串别名）、requestProvider（REQUEST 令牌，请求作用域，noop 工厂）、inquirerProvider（INQUIRER，让 transient 实例知道是谁注入了自己）。',
        'InternalCoreModuleFactory.create() 进一步把 ExternalContextCreator、ModulesContainer、HttpAdapterHost、LazyModuleLoader、SerializedGraph、ModuleRef 注册为 provider——业务里 @Inject(REQUEST) 或直接注入 ModulesContainer 能工作，全靠它。',
      ],
      members: [
        ['register(providers)', '静态注册扩展 provider'],
      ],
      seeAlso: ['Reflector', 'NestContainer', 'DependenciesScanner', 'LazyModuleLoader', 'InternalProvidersStorage'],
    },
    {
      id: 'TopologyTree', kind: 'class', name: 'TopologyTree', pkg: '@nestjs/core',
      path: 'packages/core/injector/topology-tree/topology-tree.ts', cat: ['scan'],
      summary: '模块依赖最短路树：计算模块距离、决定钩子遍历次序（环安全）',
      design: [
        '把模块 import 图折叠成以入口模块为根的最短路树（TreeNode 组成，环安全：已访问节点不再入树）。scanner 用它给每个 Module 标 distance；NestApplicationContext 的钩子调用按深度分层遍历（walk），保证被依赖模块先 init、后 destroy。',
        '它是"声明式依赖图 → 确定性初始化次序"的关键一环：开发者从不手写初始化顺序，顺序由图结构推导。',
      ],
      seeAlso: ['NestApplicationContext', 'DependenciesScanner', 'Module', 'hooks-functions'],
    },
    {
      id: 'Reflector', kind: 'class', name: 'Reflector', pkg: '@nestjs/core',
      path: 'packages/core/services/reflector.service.ts', cat: ['enhancer'],
      summary: '元数据读取门面 + createDecorator 工厂（读取装饰器写入的反射元数据）',
      design: [
        '对 Reflect 元数据的 get / getAll / getAllAndMerge / getAllAndOverride 的薄封装，按"方法 → 类"的优先级合并——守卫/拦截器里读取装饰器配置的标准姿势。',
        '静态 createDecorator<T>() 返回类型化的自定义装饰器与 key（等价 SetMetadata 但有类型提示），cats-app 的 @Roles 就是它的产物。',
        '作为 provider 由 InternalCoreModule 提供，业务里直接构造注入即可使用。',
      ],
      members: [
        ['get(key, target)', '读元数据（方法优先）'],
        ['getAllAndOverride / getAllAndMerge', '跨方法/类的合并策略'],
        ['createDecorator<T>()', '类型化自定义装饰器工厂'],
      ],
      catsApp: 'RolesGuard 里 this.reflector.get(Roles, context.getHandler()) 读取 @Roles(["admin"])；Roles 装饰器由 Reflector.createDecorator<string[]>() 创建。',
      seeAlso: ['dec-setmetadata', 'RolesGuard', 'InternalCoreModule'],
    },
    /* ================= @nestjs/core · 扫描与发现 ================= */
    {
      id: 'DependenciesScanner', kind: 'class', name: 'DependenciesScanner', pkg: '@nestjs/core',
      path: 'packages/core/scanner.ts', cat: ['scan'],
      summary: '递归扫描模块树入容器；计算模块距离；收集 APP_* 全局增强器',
      design: [
        '启动的"发现阶段"。scan(module) 先注册 InternalCoreModule（框架自身的 provider 必须先可用），再从入口模块递归 scanModulesForDependencies：读 @Module 元数据，把 imports（静态类 / DynamicModule / forwardRef）交给 ModuleCompiler 编译并 addModule，把 providers / controllers 登记到对应 Module，exports 记入导出集合。',
        '三个增值动作：(1) calculateModulesDistance 基于 TopologyTree 给模块定层级；(2) 绑定 @Global 模块的全局可见性；(3) 发现 provide 为 APP_PIPE / APP_GUARD / APP_INTERCEPTOR / APP_FILTER 的 provider 时，登记为请求作用域的全局增强器并写入 ApplicationConfig——CoreModule 的 APP_INTERCEPTOR 正是这样全局生效的。',
        '方法级扫描复用 MetadataScanner（带原型链缓存），避免重复反射。',
      ],
      members: [
        ['scan(module)', '发现阶段入口'],
        ['scanModulesForDependencies(...)', '递归 imports / providers / controllers / exports'],
        ['calculateModulesDistance(container)', '模块距离计算'],
        ['bindGlobalScope()', '全局模块绑定'],
      ],
      catsApp: 'AppModule 的 imports: [CoreModule, CatsModule] 由此展开为模块树；CoreModule 里的两个 APP_INTERCEPTOR 被收进 ApplicationConfig.globalInterceptors。',
      seeAlso: ['MetadataScanner', 'ModuleCompiler', 'NestContainer', 'ApplicationConfig', 'InternalCoreModule', 'TopologyTree'],
      snippet: {
        code: 'scan(module) {\n' +
              '  this.registerInternalCoreModule();          // 框架自身 provider 先就位\n' +
              '  this.scanModulesForDependencies(module);    // 递归 imports\n' +
              '  this.calculateModulesDistance(container);   // TopologyTree 距离\n' +
              '  this.bindGlobalScope();                     // @Global 绑定\n' +
              '}',
      },
    },
    {
      id: 'MetadataScanner', kind: 'class', name: 'MetadataScanner', pkg: '@nestjs/core',
      path: 'packages/core/metadata-scanner.ts', cat: ['scan'],
      summary: '遍历原型链收集方法名（带缓存）——一切"方法级扫描"的地基',
      design: [
        'getAllMethodNames 沿原型链取属性名，并按原型缓存结果，避免重复反射。RouterExplorer 找 @Get/@Post、MiddlewareBuilder 找 configure、DiscoveryService 找处理函数，全部建立在它之上——"类里有哪些方法"这个高频问题只回答一次。',
      ],
      seeAlso: ['DependenciesScanner', 'PathsExplorer', 'RoutesMapper'],
    },

    /* ================= @nestjs/core · 中间件 ================= */
    {
      id: 'MiddlewareModule', kind: 'class', name: 'MiddlewareModule', pkg: '@nestjs/core',
      path: 'packages/core/middleware/middleware-module.ts', cat: ['route'],
      summary: '中间件子系统总指挥：执行 configure() 并把绑定挂载到 HTTP 适配器',
      design: [
        'register() 遍历容器里实现了 NestModule 接口的模块，给它们一个 MiddlewareBuilder 作为 consumer 调用 configure(consumer)——业务声明的 apply(...).forRoutes(...) 被翻译成 MiddlewareConfiguration 数据。',
        '接着三步走：MiddlewareResolver（委托 Injector.loadMiddleware）实例化中间件类；RouteInfoPathExtractor 把 forRoutes 的控制器/路径展开成真实挂载路径；最后经 RouterProxy（统一异常包装）+ RouterExceptionFilters 调 adapter.use(path, fn) 挂载。',
        '设计动机：中间件必须先于路由注册（Express 语义），所以它在 NestApplication.init 中排在 RoutesResolver 之前执行。',
      ],
      members: [
        ['register(container, config)', '中间件子系统入口'],
        ['resolveMiddlewareParams(...)', '实例化中间件'],
        ['registerMiddleware(...)', '挂载到 HTTP 适配器'],
      ],
      catsApp: '在 AppModule 实现 NestModule：configure(consumer) { consumer.apply(LoggerMiddleware).forRoutes("cats"); } —— 即由它挂到 /cats 路径。',
      seeAlso: ['MiddlewareContainer', 'MiddlewareBuilder', 'MiddlewareResolver', 'RouteInfoPathExtractor', 'RouterProxy'],
    },
    {
      id: 'MiddlewareContainer', kind: 'class', name: 'MiddlewareContainer', pkg: '@nestjs/core',
      path: 'packages/core/middleware/container.ts', cat: ['route'],
      summary: '中间件配置期账本：按模块存配置与 InstanceWrapper',
      design: [
        '按模块 token 存 middlewareConfigs 与 wrapper 集合。与 NestContainer 一样是"先记账后干活"：configure() 期间只收集声明，实例化与挂载在之后统一进行，让配置收集与实例化解耦。',
      ],
      seeAlso: ['MiddlewareModule', 'MiddlewareResolver'],
    },
    {
      id: 'MiddlewareResolver', kind: 'class', name: 'MiddlewareResolver', pkg: '@nestjs/core',
      path: 'packages/core/middleware/resolver.ts', cat: ['route'],
      summary: '委托 Injector.loadMiddleware 实例化中间件类',
      design: [
        '中间件没有单独的实例化引擎——直接复用 Injector 的 loadMiddleware 通道，因此中间件类同样支持构造注入（LoggerMiddleware 若需要注入某个 service 也能工作）。体现"一切皆 provider"的统一性。',
      ],
      catsApp: 'LoggerMiddleware 若在模块 providers 里声明（应用类中间件的推荐做法），就由它实例化。',
      seeAlso: ['MiddlewareModule', 'Injector', 'LoggerMiddleware'],
    },
    {
      id: 'MiddlewareBuilder', kind: 'class', name: 'MiddlewareBuilder', pkg: '@nestjs/core',
      path: 'packages/core/middleware/builder.ts', cat: ['route'],
      summary: 'apply().exclude().forRoutes() 流式 API（MiddlewareConsumer 接口的实现）',
      design: [
        '流式构建器：apply 收集中间件（类 / 函数 / 工厂），forRoutes 接受路径、RouteInfo 或控制器类（经 RoutesMapper 展开为标准路由），exclude 排除若干路径，最终产出 MiddlewareConfiguration[]。',
        '把"声明式绑定"翻译成数据而不是让用户手写 adapter.use——中间件的挂载时机、顺序、异常包装全部由框架掌控。',
      ],
      members: [
        ['apply(...middleware)', '声明要挂载的中间件'],
        ['forRoutes(...routes)', '声明作用路由（可传控制器类）'],
        ['exclude(...routes)', '排除路径'],
      ],
      catsApp: 'consumer.apply(LoggerMiddleware).forRoutes(CatsController) 的链式调用即它。',
      seeAlso: ['RoutesMapper', 'RouteInfoPathExtractor', 'MiddlewareModule', 'LoggerMiddleware'],
    },
    {
      id: 'RoutesMapper', kind: 'class', name: 'RoutesMapper', pkg: '@nestjs/core',
      path: 'packages/core/middleware/routes-mapper.ts', cat: ['route'],
      summary: '把 forRoutes 里的控制器类/路径统一映射为标准 RouteInfo[]',
      design: [
        'forRoutes 可以直接传 CatsController 这样的类——RoutesMapper 借 PathsExplorer + MetadataScanner 读 @Controller 路径，把类展开成 { path, method } 列表。此后流程无需再区分"传的是类还是字符串"——归一化输入的经典手法。',
      ],
      seeAlso: ['MiddlewareBuilder', 'PathsExplorer'],
    },
    {
      id: 'RouteInfoPathExtractor', kind: 'class', name: 'RouteInfoPathExtractor', pkg: '@nestjs/core',
      path: 'packages/core/middleware/route-info-path-extractor.ts', cat: ['route'],
      summary: '展开 RouteInfo 为真实挂载路径（综合全局前缀/版本/排除项）',
      design: [
        '综合全局前缀、版本前缀、exclude 列表与通配符，把声明式路由信息变成适配器认识的最终路径。中间件与路由两套系统共享 RoutePathFactory 的拼路径逻辑——保证 forRoutes("cats") 与 @Controller("cats") 对"同一路径"的理解严格一致。',
      ],
      seeAlso: ['RoutePathFactory', 'MiddlewareModule'],
    },

    /* ================= @nestjs/core · 路由 ================= */
    {
      id: 'RoutesResolver', kind: 'class', name: 'RoutesResolver', pkg: '@nestjs/core',
      path: 'packages/core/router/routes-resolver.ts', cat: ['route'],
      summary: '路由注册总入口：协调 RouterExplorer，并挂载 404 / 异常兜底 handler',
      design: [
        'resolve(adapter) 遍历容器的所有模块/控制器交给 RouterExplorer 逐个注册路由；随后注册两个兜底：not-found handler（未匹配路由返回 404 JSON）与 exception handler，都经 RouterProxy 包装。',
        '它自己是"总入口 + 兜底"，具体的路径发现、管道构建、方法挂载全部委托 RouterExplorer——职责切分干净。',
      ],
      members: [
        ['resolve(router)', '注册全部模块路由'],
        ['registerNotFoundHandler(...)', '404 兜底'],
        ['registerExceptionHandler(...)', '异常兜底'],
      ],
      catsApp: 'CatsController 的 @Get(":id") 在这一步被挂到 Express：app.get("/cats/:id", proxy)。',
      seeAlso: ['RouterExplorer', 'RouterProxy', 'RouterExceptionFilters', 'NestApplication'],
    },
    {
      id: 'RouterExplorer', kind: 'class', name: 'RouterExplorer', pkg: '@nestjs/core',
      path: 'packages/core/router/router-explorer.ts', cat: ['route'],
      summary: '单控制器路由注册协调器：路径探索→管道构建→代理→挂载（纯编排者）',
      design: [
        '对每个控制器执行五步：PathsExplorer 扫方法得 RouteDefinition（path+method 元数据）→ RouterExecutionContext 为每个方法编译完整执行管道 → RoutePathFactory 拼最终路径 → RouterMethodFactory 把 RequestMethod 枚举映射为 adapter.get/post/... → RouterProxy 包装后挂载，并打印 "Mapped {route}" 日志。',
        '自己不实现任何一步，只定次序——"编排者（Orchestrator）"模式的教科书案例：每个子组件都可以独立替换与测试。',
      ],
      catsApp: '启动日志里 Mapped {/cats, POST} / Mapped {/cats, GET} / Mapped {/cats/:id, GET} 三行就是它打的。',
      seeAlso: ['PathsExplorer', 'RouterExecutionContext', 'RoutePathFactory', 'RouterMethodFactory', 'RouterProxy', 'RoutesResolver'],
    },
    {
      id: 'PathsExplorer', kind: 'class', name: 'PathsExplorer', pkg: '@nestjs/core',
      path: 'packages/core/router/paths-explorer.ts', cat: ['route'],
      summary: '扫描控制器方法，产出 RouteDefinition（路径 + HTTP 方法元数据）',
      design: [
        'MetadataScanner 拿方法列表，逐个 Reflect 读 PATH_METADATA / METHOD_METADATA；控制器类路径与方法路径的拼接交给 RoutePathFactory。中间件系统（RoutesMapper）也复用它读取控制器路径——单一职责、多处复用。',
      ],
      catsApp: 'CatsController 的 create / findAll / findOne 被它识别为 POST /cats、GET /cats、GET /cats/:id。',
      seeAlso: ['MetadataScanner', 'RoutePathFactory', 'RouterExplorer'],
    },
    {
      id: 'RoutePathFactory', kind: 'class', name: 'RoutePathFactory', pkg: '@nestjs/core',
      path: 'packages/core/router/route-path-factory.ts', cat: ['route'],
      summary: '最终路径拼装器：版本前缀→模块→控制器→方法→全局前缀（+exclude）',
      design: [
        '把五层可能性按序拼接：URI 版本前缀、模块路径（RouterModule 设置的 MODULE_PATH）、控制器 @Controller 路径、方法路径、全局前缀（含 exclude 规则）；通配符透传（LegacyRouteConverter 兼容 path-to-regexp v8 的语法迁移）。',
        '集中一处拼接的意义：中间件 forRoutes 与路由注册共享同一实现，"同一条路径"永远不会出现两套拼法。',
      ],
      seeAlso: ['RouterExplorer', 'RouteInfoPathExtractor'],
    },
    {
      id: 'RouterMethodFactory', kind: 'class', name: 'RouterMethodFactory', pkg: '@nestjs/core',
      path: 'packages/core/helpers/router-method-factory.ts', cat: ['route'],
      summary: 'RequestMethod 枚举 → 适配器注册方法名（get/post/...）的小映射器',
      design: [
        '极小的映射器：把 @Get() 对应的 RequestMethod.GET 翻译成 adapter["get"]。单独成类的原因：Search/WebDAV 等非常规动词与版本化兼容会持续扩展，独立演化而不污染主流程。',
      ],
      seeAlso: ['RouterExplorer', 'AbstractHttpAdapter'],
    },
    {
      id: 'RouterProxy', kind: 'class', name: 'RouterProxy', pkg: '@nestjs/core',
      path: 'packages/core/router/router-proxy.ts', cat: ['exception'],
      summary: '把 handler 包装成 (req,res,next) 回调；异常统一导入过滤器链',
      design: [
        '适配器只接受普通回调，而 Nest 的 handler 需要 ExecutionContextHost 语义与异常兜底。createProxy 返回的闭包 catch 一切同步/异步异常，包装成 ExecutionContextHost 后交给 ExceptionsHandler（过滤器链入口）。',
        '中间件挂载也走它（createExceptionLayerProxy），保证中间件抛错同样进过滤器——整个 HTTP 层只有这一个异常入口，绝不散落。',
      ],
      members: [
        ['createProxy(callback, exceptionsHandler)', '路由回调包装'],
        ['createExceptionLayerProxy(...)', '中间件/兜底 handler 包装'],
      ],
      catsApp: 'ParseIntPipe 抛出的 BadRequestException 能变成 400 响应，链路的第一环就是这里的 catch。',
      seeAlso: ['RouterExecutionContext', 'ExceptionsHandler', 'RoutesResolver', 'MiddlewareModule'],
    },
    {
      id: 'RouterExceptionFilters', kind: 'class', name: 'RouterExceptionFilters', pkg: '@nestjs/core',
      path: 'packages/core/router/router-exception-filters.ts', cat: ['exception'],
      summary: '按路由编译异常过滤器链（全局 + 控制器 + 方法三级）',
      design: [
        '继承 BaseExceptionFilterContext：对每个 handler 反射 EXCEPTION_FILTERS_METADATA（@UseFilters），与全局 / 控制器级合并，产出 { func, exceptionMetatypes } 上下文并实例化为 ExceptionsHandler。每条路由一条链，构造期完成、请求期零反射。',
      ],
      catsApp: '在 findOne 上加 @UseFilters(HttpExceptionFilter) 即在此被编入该路由专属的过滤器链。',
      seeAlso: ['BaseExceptionFilterContext', 'ExceptionsHandler', 'ApplicationConfig', 'dec-catch'],
    },
    {
      id: 'RouterExecutionContext', kind: 'class', name: 'RouterExecutionContext', pkg: '@nestjs/core',
      path: 'packages/core/router/router-execution-context.ts', cat: ['route'],
      summary: '单路由完整请求管道的编译器：Guard→Interceptor→Pipe→Handler→响应',
      design: [
        '每个路由方法在启动期被"编译"成一个 fn(request, response, next)。编译次序即请求处理次序：① 守卫链（不过则 403）→ ② HttpCode/Header 元数据就位 → ③ 拦截器（RxJS 包裹后续整个流程）→ ④ 参数提取 + 管道转换 → ⑤ handler 调用 → ⑥ RouterResponseController 写响应。',
        '关键设计是"构造期反射、请求期零反射"：HandlerMetadataStorage 缓存参数/返回值元数据，ContextUtils 提供工具；请求到来只是执行编译好的闭包链，性能与 Express 原生路由同量级。',
        'guard / pipe / interceptor 实例来自各自 ContextCreator（全局→控制器→方法三级合并）——四件套同构的根源就在这。',
      ],
      members: [
        ['create(fn, module, class, method, ...)', '编译路由管道'],
        ['getGuardFn / getInterceptorFn / getPipesFn / getParamsFn', '各环节闭包工厂'],
      ],
      catsApp: 'GET /cats/1 的管道 = [RolesGuard] → [Transform、Logging 拦截器] → [ParseIntPipe(:id)] → CatsController.findOne → 响应包裹 {data: ...}。',
      seeAlso: ['GuardsConsumer', 'InterceptorsConsumer', 'PipesConsumer', 'RouteParamsFactory', 'RouterResponseController', 'RouterExplorer'],
      snippet: {
        code: '// 编译产物（概念示意）\n' +
              'const proxy = (req, res, next) => {\n' +
              '  guards(req, res)                                  // ① 守卫\n' +
              '    ? interceptors(pipes(params(req)) → handler(req)) // ②③④⑤\n' +
              '        .subscribe(data => reply(res, data))          // ⑥ 响应\n' +
              '    : res.status(403);\n' +
              '}',
      },
    },
    {
      id: 'RouteParamsFactory', kind: 'class', name: 'RouteParamsFactory', pkg: '@nestjs/core',
      path: 'packages/core/router/route-params-factory.ts', cat: ['route'],
      summary: '按参数类型枚举从 req/res/next 提取原始值（参数系统第一层）',
      design: [
        'exchangeKeyForValue 把 RouteParamtypes 枚举（BODY/QUERY/PARAM/HEADERS/IP/REQUEST/...）映射到 req.body / req.params[id] 等真实取值路径；自定义参数装饰器（createParamDecorator 产物）作为 CUSTOM 类型把 req 整个交给工厂函数处理。',
      ],
      catsApp: '@Body() createCatDto → req.body；@Param("id") → req.params.id，均由它先行取值。',
      seeAlso: ['ParamsTokenFactory', 'PipesConsumer', 'route-params-decorators'],
    },
    {
      id: 'ParamsTokenFactory', kind: 'class', name: 'ParamsTokenFactory', pkg: '@nestjs/core',
      path: 'packages/core/pipes/params-token-factory.ts', cat: ['route'],
      summary: '参数元数据 → body/query/param/custom 分类 token',
      design: [
        '把每个参数的装饰器数据规整为 { index, type, data, pipes } 结构，供 PipesConsumer 决定管道作用目标——参数级管道只对对应 token 生效。只分类不取值，与 RouteParamsFactory 的取值职责严格分离。',
      ],
      seeAlso: ['PipesConsumer', 'RouteParamsFactory'],
    },
    {
      id: 'RouterResponseController', kind: 'class', name: 'RouterResponseController', pkg: '@nestjs/core',
      path: 'packages/core/router/router-response-controller.ts', cat: ['route'],
      summary: '响应写出器：HttpCode/Header/Redirect/Render/SSE 的统一出口',
      design: [
        'handler 返回值经它落盘：默认 adapter.reply（res.status(200).json）；@HttpCode/@Header 覆盖状态与头；@Redirect 处理 3xx；@Render 走模板引擎 res.render；@Sse 用 SseStream 把 Observable 变成 text/event-stream。',
        '把"响应形态的多样性"集中到一个类，管道其余部分只管计算数据——响应侧的单一职责。',
      ],
      catsApp: 'findAll 返回的 Cat[] 经它 res.json(cats)；若挂着 TransformInterceptor，则写出 {data: cats}。',
      seeAlso: ['RouterExecutionContext', 'SseStream', 'AbstractHttpAdapter'],
    },
    {
      id: 'SseStream', kind: 'class', name: 'SseStream', pkg: '@nestjs/core',
      path: 'packages/core/router/sse-stream.ts', cat: ['route'],
      summary: 'SSE 输出流（Transform）：把对象序列化为 data: ... 事件帧',
      design: [
        'Node Transform 流，把业务推送的对象序列化为 SSE 协议帧推给客户端；RouterResponseController 处理 @Sse 路由时创建——请求生命周期里"长连接出口"的实现体。',
      ],
      seeAlso: ['RouterResponseController'],
    },

    /* ================= @nestjs/core · 增强器四件套 ================= */
    {
      id: 'ContextCreator', kind: 'class', name: 'ContextCreator', pkg: '@nestjs/core',
      path: 'packages/core/helpers/context-creator.ts', cat: ['enhancer'],
      summary: '增强器收集的模板方法基类：全局→类→方法三级合并后交子类具体化',
      design: [
        '抽象模板方法 createContext：先反射类与方法上的 @UseXxx 元数据，与 ApplicationConfig 的全局列表按 全局→类→方法 连接；再调子类 createConcreteContext 把"类 / 实例混合的声明"实例化（容器解析或 new），并按 metatype 缓存实例。',
        'Guards / Pipes / Interceptors / Filters 四个 ContextCreator 全部继承它——四件套的收集规则完全同构，这就是 Nest "横切关注点统一模型"的实现根源。新增一类增强器只需继承并实现具体化逻辑。',
      ],
      members: [
        ['createContext(instance, callback, metadataKey)', '模板方法入口'],
        ['createConcreteContext(声明数组)', '子类实现：实例化'],
        ['getInstanceByMetatype(...)', '按类缓存实例'],
      ],
      seeAlso: ['GuardsContextCreator', 'PipesContextCreator', 'InterceptorsContextCreator', 'BaseExceptionFilterContext'],
      snippet: {
        code: 'createContext(concrete, callback, metadataKey) {\n' +
              '  const global = this.applicationConfig.get(metadataKey);\n' +
              '  const classScope  = this.reflectClassMetadata(callback, key);\n' +
              '  const methodScope = this.reflectCallbackMetadata(callback, key);\n' +
              '  return this.createConcreteContext(\n' +
              '    [...global, ...classScope, ...methodScope]);  // 三级合并\n' +
              '}',
      },
    },
    {
      id: 'GuardsContextCreator', kind: 'class', name: 'GuardsContextCreator', pkg: '@nestjs/core',
      path: 'packages/core/guards/guards-context-creator.ts', cat: ['enhancer'],
      summary: '编译每条路由的守卫实例列表（三级合并，继承 ContextCreator）',
      design: [
        'ContextCreator 的 Guard 版：合并全局（app.useGlobalGuards 或 APP_GUARD）、控制器级与方法级 @UseGuards，从容器解析或直接实例化。产出顺序即执行顺序。',
      ],
      catsApp: '@UseGuards(RolesGuard) 声明在 CatsController 类上 → 该控制器全部路由的守卫列表 = [RolesGuard]。',
      seeAlso: ['ContextCreator', 'GuardsConsumer', 'ApplicationConfig', 'use-enhancers-decorators'],
    },
    {
      id: 'GuardsConsumer', kind: 'class', name: 'GuardsConsumer', pkg: '@nestjs/core',
      path: 'packages/core/guards/guards-consumer.ts', cat: ['enhancer'],
      summary: '顺序执行守卫链：tryActivate 逐个判定，false 即 403 短路',
      design: [
        'tryActivate 逐个 await canActivate(context)，支持同步 / Promise / Observable 三种返回；任何一个 false 立刻抛 ForbiddenException 短路整条管道。',
        '进入守卫前把请求参数包装成 ExecutionContextHost（实现 ArgumentsHost 的 switchToHttp/Rpc/Ws）——业务里 context.switchToHttp().getRequest() 的来源。',
      ],
      members: [
        ['tryActivate(guards, args)', '执行守卫链'],
        ['createContext(args, ...)', '构造 ExecutionContextHost'],
      ],
      catsApp: 'RolesGuard.canActivate 里 context.switchToHttp().getRequest().user 的 context 即由它构造；校验失败 → 403。',
      seeAlso: ['GuardsContextCreator', 'RolesGuard', 'iface-arguments-host'],
    },
    {
      id: 'PipesContextCreator', kind: 'class', name: 'PipesContextCreator', pkg: '@nestjs/core',
      path: 'packages/core/pipes/pipes-context-creator.ts', cat: ['enhancer'],
      summary: '编译管道列表：三级合并 + 参数装饰器内联管道',
      design: [
        '管道比守卫多一个来源：参数装饰器里直接传实例（@Param("id", ParseIntPipe)）。createContext 做同样的三级合并；参数级管道在编译参数提取闭包时另算——最终 PipesConsumer 按"参数管道先于路由管道"的次序应用。',
      ],
      catsApp: 'main.ts 的全局 ValidationPipe + @Param("id", new ParseIntPipe()) 两个来源在它这里汇成一条链。',
      seeAlso: ['ContextCreator', 'PipesConsumer', 'ApplicationConfig', 'route-params-decorators'],
    },
    {
      id: 'PipesConsumer', kind: 'class', name: 'PipesConsumer', pkg: '@nestjs/core',
      path: 'packages/core/pipes/pipes-consumer.ts', cat: ['enhancer'],
      summary: '把管道链 reduce 地应用到参数值上（值→管道1→管道2→...→handler）',
      design: [
        'apply(value, metatype等元数据, pipes)：value 依次经每个管道 await transform(...) 后传给下一个（reduce 语义）。ArgumentMetadata 携带 metatype，让 ValidationPipe 能区分"DTO 类需要校验"与"标量直接放行"。',
        '管道抛出的异常（如 BadRequestException）沿调用栈直接进入 RouterProxy 的 catch → 过滤器链——无需额外管道级异常机制。',
      ],
      members: [
        ['apply(value, metadata, pipes)', '链式应用管道'],
      ],
      catsApp: '":id" 的 "1" → ParseIntPipe.transform → 1；@Body 的 createCatDto → 全局 ValidationPipe 校验失败抛 400。',
      seeAlso: ['PipesContextCreator', 'ParamsTokenFactory', 'RouteParamsFactory', 'cats-parse-int-pipe'],
    },
    {
      id: 'InterceptorsContextCreator', kind: 'class', name: 'InterceptorsContextCreator', pkg: '@nestjs/core',
      path: 'packages/core/interceptors/interceptors-context-creator.ts', cat: ['enhancer'],
      summary: '编译拦截器列表（全局 APP_INTERCEPTOR → 类 → 方法三级）',
      design: [
        '三级合并与守卫/管道同构。特别之处：CoreModule 用 { provide: APP_INTERCEPTOR, useClass } 注册的请求级拦截器由 ApplicationConfig 以 InstanceWrapper 形态供给，实例化由容器完成——全局拦截器因此也支持依赖注入。',
      ],
      catsApp: 'CoreModule 注册的 TransformInterceptor 与 LoggingInterceptor 出现在每条路由拦截器列表的最前（全局级）。',
      seeAlso: ['ContextCreator', 'InterceptorsConsumer', 'ApplicationConfig', 'CoreModule'],
    },
    {
      id: 'InterceptorsConsumer', kind: 'class', name: 'InterceptorsConsumer', pkg: '@nestjs/core',
      path: 'packages/core/interceptors/interceptors-consumer.ts', cat: ['enhancer'],
      summary: 'RxJS 链式执行拦截器：前半段 + handler + 后半段（洋葱模型）',
      design: [
        '拦截器天然是"洋葱"：intercept 里 next.handle() 之前的逻辑在 handler 前执行，pipe() 里的操作符在 handler 后执行。实现为递归组合：从最后一个拦截器向前包裹，最终 subscribe 触发整条链。AsyncResource 保留 async_hooks 上下文不断链。',
        '因为 handler 返回值被 Observable 化，map / tap / catchError / timeout 成为业务的自然组合件——这是 Nest 选择 RxJS 作为管道粘合剂的直接原因。',
      ],
      members: [
        ['intercept(context, next, interceptors)', '构建并执行 RxJS 链'],
        ['createLazyDeferred(...)', '把 handler 结果 Deferred 化'],
      ],
      catsApp: 'LoggingInterceptor 的 tap 打印耗时、TransformInterceptor 的 map 改写为 {data} —— 都在这条链上生效。',
      seeAlso: ['InterceptorsContextCreator', 'RouterExecutionContext', 'RouterResponseController', 'TransformInterceptor'],
      snippet: {
        code: '// 从后往前包裹（概念示意）\n' +
              'let stream = handlerObservable();\n' +
              'for (const icpt of interceptors.reverse()) {\n' +
              '  stream = icpt.intercept(context, { handle: () => stream });\n' +
              '}\n' +
              'stream.subscribe(data => responseController.reply(res, data));',
      },
    },

    /* ================= @nestjs/core · 异常（请求期） ================= */
    {
      id: 'ExceptionsHandler', kind: 'class', name: 'ExceptionsHandler', pkg: '@nestjs/core',
      path: 'packages/core/exceptions/exceptions-handler.ts', cat: ['exception'],
      summary: '路由异常第一站：先走 @UseFilters 自定义链，未匹配则基类兜底',
      design: [
        '继承 BaseExceptionFilter。RouterExceptionFilters 编译过滤器时，若路由有 @UseFilters，则自定义链被前置：异常按 @Catch 声明的类型匹配第一个过滤器；没有匹配或没有自定义链时，退回 BaseExceptionFilter 的标准响应。',
        'RouterProxy catch 到的一切异常都汇到这里——整个 HTTP 层唯一的异常汇合点，保证"任何错误都有出口"。',
      ],
      catsApp: 'common/filters/http-exception.filter.ts 若通过 @UseFilters 挂载，HttpException 抛出时先于默认响应执行，可自定义 JSON 结构（statusCode/timestamp/path）。',
      seeAlso: ['BaseExceptionFilter', 'RouterProxy', 'RouterExceptionFilters', 'HttpExceptionFilter'],
    },
    {
      id: 'BaseExceptionFilter', kind: 'class', name: 'BaseExceptionFilter', pkg: '@nestjs/core',
      path: 'packages/core/exceptions/base-exception-filter.ts', cat: ['exception'],
      summary: '最终兜底过滤器：HttpException→对应状态码，其余→500',
      design: [
        'catch(exception, host)：HttpException 取 getStatus()/getResponse() 写回；其他异常记日志并返回 500 "Internal server error"。',
        '它通过可选注入 HttpAdapterHost 拿到适配器来写响应——本身不 import 任何平台代码，保持 core 纯净（依赖注入替代硬依赖的示范）。',
      ],
      seeAlso: ['ExceptionsHandler', 'exception-http', 'InternalProvidersStorage'],
    },
    {
      id: 'BaseExceptionFilterContext', kind: 'class', name: 'BaseExceptionFilterContext', pkg: '@nestjs/core',
      path: 'packages/core/exceptions/base-exception-filter-context.ts', cat: ['exception'],
      summary: '过滤器元数据编译基类：产出 { func, exceptionMetatypes }',
      design: [
        'ContextCreator 家族的过滤器版：反射 @Catch 的类型参数（FILTER_CATCH_EXCEPTIONS 元数据），按全局→类→方法合并，产出可执行 func 与捕获类型表。RouterExceptionFilters（HTTP）与 ExternalExceptionFilterContext（WS/RPC）都由它派生。',
      ],
      seeAlso: ['ContextCreator', 'RouterExceptionFilters', 'ExternalContextCreator'],
    },
    {
      id: 'ExternalContextCreator', kind: 'class', name: 'ExternalContextCreator', pkg: '@nestjs/core',
      path: 'packages/core/helpers/external-context-creator.ts', cat: ['enhancer'],
      summary: '为非 HTTP 传输（WS/RPC/GraphQL）构建与 HTTP 同构的执行管道',
      design: [
        '静态工厂 fromContainer(container) 组装同一套 ContextCreator / Consumer，只是参数工厂换成对应传输的（如微服务的 @Payload/@Ctx）。设计动机：增强器语义跨传输一致——同一个 Guard 写一次，在 HTTP 与 WebSocket 里行为相同。由 InternalCoreModuleFactory 注册，供 SocketModule / MicroservicesModule 使用。',
      ],
      seeAlso: ['ContextCreator', 'GuardsConsumer', 'MicroservicesModule', 'InternalCoreModule'],
    },

    /* ================= @nestjs/core · 平台适配 ================= */
    {
      id: 'AbstractHttpAdapter', kind: 'class', name: 'AbstractHttpAdapter', pkg: '@nestjs/core',
      path: 'packages/core/adapters/http-adapter.ts', cat: ['platform'],
      summary: '平台适配器抽象桥：统一操作直接转发，平台特定能力声明为抽象方法',
      design: [
        'implements common 的 HttpServer 接口：use/get/post/put/patch/delete/.../listen/close 等统一方法直接转发给内部的 httpServer 实例；而 reply / redirect / render / body 解析 / 静态资源 / CORS / 版本化这些"平台各有做法"的操作声明为抽象方法，留给子类实现。',
        '模板方法 + 适配器的组合：core 的路由/响应代码只面向本抽象，ExpressAdapter（platform-express）与 FastifyAdapter（platform-fastify）各自补齐抽象部分——框架核心与 HTTP 平台彻底解耦，这也是"同一套 @Controller 代码可切换平台"的根基。',
      ],
      members: [
        ['use / get / post / ... / listen', '转发给底层 httpServer'],
        ['reply / redirect / render（抽象）', '由平台子类实现'],
        ['init / close', '解析器初始化与服务器关闭'],
      ],
      seeAlso: ['ExpressAdapter', 'RouterResponseController', 'NestFactoryStatic'],
    },
    /* ================= @nestjs/common · 装饰器（编译期） ================= */
    {
      id: 'dec-module', kind: 'decoratorGroup', name: 'Module', pkg: '@nestjs/common',
      path: 'packages/common/decorators/modules/module.decorator.ts', cat: ['decorator'],
      summary: '@Module 装饰器：把模块元数据（四元组）写入类',
      design: [
        '用 Reflect.defineMetadata(MODULE_METADATA) 把 { imports, controllers, providers, exports } 写到类上，供 DependenciesScanner 后续反射；同时打上 watermark 供快速判别"这是不是一个模块"。',
        '装饰器只写数据、不含逻辑——"声明在编译期、解释在运行期"是 Nest 一切装饰器的统一哲学，也是 TS 装饰器与 Reflect.metadata 的标准组合拳。',
      ],
      catsApp: 'app.module.ts / cats.module.ts / core.module.ts 三个模块的元数据即由它写入。',
      seeAlso: ['dec-global', 'DependenciesScanner', 'common-constants', 'AppModule'],
    },
    {
      id: 'dec-global', kind: 'decoratorGroup', name: 'Global', pkg: '@nestjs/common',
      path: 'packages/common/decorators/modules/global.decorator.ts', cat: ['decorator'],
      summary: '@Global 装饰器：模块的 exports 无需被 import 即全局可注入',
      design: [
        '写入全局标记元数据，scanner 的 bindGlobalScope 把模块加入容器全局集合，其 exports 对所有模块可见。动机：配置 / 工具类模块（如 ConfigModule）不该被迫出现在每个模块的 imports 里。',
      ],
      seeAlso: ['dec-module', 'DependenciesScanner'],
    },
    {
      id: 'dec-injectable', kind: 'decoratorGroup', name: 'Injectable', pkg: '@nestjs/common',
      path: 'packages/common/decorators/core/injectable.decorator.ts', cat: ['decorator'],
      summary: '@Injectable 装饰器：标记类可被注入（含 scope / durable 选项）',
      design: [
        '写入 INJECTABLE_WATERMARK 与 scope / durable 元数据（Scope.DEFAULT / REQUEST / TRANSIENT）。它是 provider 的"身份证"：scanner 据此把类登记为 provider，InstanceWrapper 读取 scope 决定实例缓存策略。',
        '也用于标记 Guard / Pipe / Interceptor / Filter 等增强器——它们同样是容器管理的可注入单元。',
      ],
      catsApp: 'CatsService、RolesGuard、自定义管道与拦截器全部由它标记。',
      seeAlso: ['dec-controller', 'InstanceWrapper', 'DependenciesScanner', 'CatsService'],
    },
    {
      id: 'dec-controller', kind: 'decoratorGroup', name: 'Controller', pkg: '@nestjs/common',
      path: 'packages/common/decorators/core/controller.decorator.ts', cat: ['decorator'],
      summary: '@Controller 装饰器：标记类为控制器（路径 / 版本 / scope 选项）',
      design: [
        '写入 CONTROLLER_WATERMARK 与 PATH_METADATA（可选 version / scope）。scanner 据此把类放入模块 _controllers，RouterExplorer 再按路径元数据拼路由。',
        '与 @Injectable 的分工：控制器"接收请求"、provider"提供服务"，但两者都是容器管理的可注入单元——控制器也能被注入（例如 TestingModule 里 get(CatsController)）。',
      ],
      catsApp: '@Controller("cats") 使 CatsController 的全部路由挂在 /cats 前缀下。',
      seeAlso: ['dec-injectable', 'http-method-decorators', 'PathsExplorer', 'CatsController'],
    },
    {
      id: 'dec-catch', kind: 'decoratorGroup', name: 'Catch', pkg: '@nestjs/common',
      path: 'packages/common/decorators/core/catch.decorator.ts', cat: ['decorator'],
      summary: '@Catch 装饰器：声明异常过滤器捕获的异常类型列表',
      design: [
        '把类型列表写入 FILTER_CATCH_EXCEPTIONS；编译过滤器链时据此做 instanceof 匹配，空参等于全捕获。让"哪个过滤器处理哪种异常"成为声明式配置而非 if/else 硬编码。',
      ],
      catsApp: '@Catch(HttpException) 限定 HttpExceptionFilter 只接管 HttpException。',
      seeAlso: ['BaseExceptionFilterContext', 'HttpExceptionFilter'],
    },
    {
      id: 'use-enhancers-decorators', kind: 'decoratorGroup', name: 'UseGuards/UsePipes/…', pkg: '@nestjs/common',
      path: 'packages/common/decorators/core/use-guards.decorator.ts 等', cat: ['decorator'],
      summary: 'UseGuards / UsePipes / UseInterceptors / UseFilters 四件套绑定装饰器',
      design: [
        '四个同构装饰器：分别在类 / 方法（管道还可在参数）上写对应元数据，值是"类或实例"的混合数组——实例化与三级合并交给各 ContextCreator。',
        '使用方只声明"要什么"，实例怎么来（容器解析 or new）由框架决定——因此增强器自身也可以依赖注入。',
      ],
      catsApp: '@UseGuards(RolesGuard) 声明在 CatsController 类级，作用于该控制器全部路由。',
      seeAlso: ['ContextCreator', 'GuardsContextCreator', 'PipesContextCreator'],
    },
    {
      id: 'dec-setmetadata', kind: 'decoratorGroup', name: 'SetMetadata', pkg: '@nestjs/common',
      path: 'packages/common/decorators/core/set-metadata.decorator.ts', cat: ['decorator'],
      summary: 'SetMetadata / Reflector.createDecorator：自定义元数据的写入通道',
      design: [
        'SetMetadata(key, value) 返回的装饰器把任意键值写进元数据；Reflector.createDecorator<T>() 是其类型化进化版（生成强类型的 key + 装饰器对）。',
        '配合 Reflector.get 形成"业务声明 → 横切逻辑读取"的元数据闭环，是守卫/拦截器定制化的事实标准（角色、权限、节流标签……）。',
      ],
      catsApp: 'common/decorators/roles.decorator.ts：export const Roles = Reflector.createDecorator<string[]>()。',
      seeAlso: ['Reflector', 'RolesGuard'],
    },
    {
      id: 'dec-inject-optional', kind: 'decoratorGroup', name: 'Inject/Optional', pkg: '@nestjs/common',
      path: 'packages/common/decorators/core/inject.decorator.ts 等', cat: ['decorator'],
      summary: '@Inject / @Optional 装饰器：定制构造参数的注入行为',
      design: [
        '@Inject(token) 覆盖按 TS 类型推断的参数 token（字符串 token / 接口必须用它）；@Optional 标记依赖可缺省——解析失败注入 undefined 而非抛 UnknownDependenciesException。',
        '元数据写入 SELF_DECLARED_DEPS / OPTIONAL_DEPS，由 Injector.resolveConstructorParams 在实例化时消费。',
      ],
      seeAlso: ['Injector'],
    },
    {
      id: 'http-method-decorators', kind: 'decoratorGroup', name: 'Get/Post/Put/…', pkg: '@nestjs/common',
      path: 'packages/common/decorators/http/request-mapping.decorator.ts', cat: ['decorator'],
      summary: 'HTTP 方法装饰器组：@Get/@Post/@Put/@Patch/@Delete/@All/@Sse…',
      design: [
        '由 RequestMapping 工厂统一生成：写入 METHOD_METADATA（RequestMethod 枚举）+ PATH_METADATA。PathsExplorer 靠这两个 key 发现路由——装饰器与扫描器之间只存在元数据契约，彼此从不直接调用。',
      ],
      catsApp: '@Post() create / @Get() findAll / @Get(":id") findOne。',
      seeAlso: ['PathsExplorer', 'dec-controller', 'common-constants'],
    },
    {
      id: 'route-params-decorators', kind: 'decoratorGroup', name: 'Param/Body/Query/…', pkg: '@nestjs/common',
      path: 'packages/common/decorators/http/route-params.decorator.ts', cat: ['decorator'],
      summary: '路由参数装饰器组：@Param/@Body/@Query/@Headers/@Req…（支持内联管道）',
      design: [
        'createRouteParamDecorator(type) 工厂按 RouteParamtypes 枚举生成；@Param("id") 额外支持内联管道。数据写入 ROUTE_ARGS_METADATA（含 index / data / pipes），请求期由 RouteParamsFactory + ParamsTokenFactory 消费。',
        '自定义参数装饰器（createParamDecorator）以 CUSTOM 类型接入同一条管道——参数体系天然可扩展。',
      ],
      catsApp: '@Body() createCatDto、@Param("id", new ParseIntPipe()) id。',
      seeAlso: ['RouteParamsFactory', 'ParamsTokenFactory', 'PipesConsumer', 'cats-parse-int-pipe'],
    },
    {
      id: 'response-decorators', kind: 'decoratorGroup', name: 'HttpCode/Header/Render/…', pkg: '@nestjs/common',
      path: 'packages/common/decorators/http/http-code.decorator.ts 等', cat: ['decorator'],
      summary: '响应行为装饰器组：@HttpCode/@Header/@Redirect/@Render/@Sse',
      design: [
        '分别写入状态码 / 响应头 / 重定向 / 模板 / SSE 元数据，RouterResponseController 在请求期据此定制响应形态。声明式响应控制：handler 只负责返回数据。',
      ],
      seeAlso: ['RouterResponseController'],
    },
    {
      id: 'common-constants', kind: 'constants', name: '元数据常量表', pkg: '@nestjs/common',
      path: 'packages/common/constants.ts', cat: ['contract'],
      summary: '元数据键名与水印常量：PATH_METADATA / INJECTABLE_WATERMARK…',
      design: [
        '装饰器（写入方）与扫描器/编译器（读取方）唯一共享的契约表：PATH_METADATA、METHOD_METADATA、ROUTE_ARGS_METADATA、PIPES/GUARDS/INTERCEPTORS/FILTERS_METADATA、MODULE_METADATA…',
        'v10.4+ 增加的 watermark（INJECTABLE_WATERMARK / CONTROLLER_WATERMARK / CATCH_WATERMARK…）用于 O(1) 判别"这个类是什么"，替代旧的 undefined 检查，也让装饰器无法伪造的空值场景更安全。',
      ],
      seeAlso: ['dec-module', 'http-method-decorators', 'DependenciesScanner'],
    },

    /* ================= @nestjs/common · 契约接口 ================= */
    {
      id: 'iface-can-activate', kind: 'interface', name: 'CanActivate', pkg: '@nestjs/common',
      path: 'packages/common/interfaces/features/can-activate.interface.ts', cat: ['contract'],
      summary: '守卫契约：canActivate(context) → boolean / Promise / Observable',
      design: [
        '接口而非抽象类——Nest 的增强器契约全部是"接口 + 可选 @Injectable"：实现零耦合，类图上不与框架发生继承关系。ExecutionContext 扩展了 ArgumentsHost，使同一契约可跨 HTTP/RPC/WS 使用。',
      ],
      catsApp: 'RolesGuard implements CanActivate。',
      seeAlso: ['GuardsConsumer', 'RolesGuard', 'iface-arguments-host'],
    },
    {
      id: 'iface-pipe-transform', kind: 'interface', name: 'PipeTransform', pkg: '@nestjs/common',
      path: 'packages/common/interfaces/features/pipe-transform.interface.ts', cat: ['contract'],
      summary: '管道契约：transform(value, metadata: ArgumentMetadata)',
      design: [
        'metadata 携带 metatype / type / data，让管道能区分"DTO 需要校验"与"标量直接转换"；同步或 Promise 均可。管道职责被刻意限定为"值进值出"，不做流程控制——那是守卫和拦截器的事。',
      ],
      catsApp: '自定义 ParseIntPipe 与 ValidationPipe 均 implements PipeTransform。',
      seeAlso: ['PipesConsumer', 'cats-parse-int-pipe', 'pipe-validation'],
    },
    {
      id: 'iface-nest-interceptor', kind: 'interface', name: 'NestInterceptor', pkg: '@nestjs/common',
      path: 'packages/common/interfaces/features/nest-interceptor.interface.ts', cat: ['contract'],
      summary: '拦截器契约：intercept(context, next: CallHandler) → Observable',
      design: [
        'CallHandler.handle() 是"继续执行"的句柄——用 RxJS 表达洋葱模型：subscribe 之前是前半段，pipe 操作符是后半段。契约只有一行，却同时覆盖日志、转换、缓存、超时、异常映射等横切场景。',
      ],
      catsApp: 'LoggingInterceptor（tap 计时）/ TransformInterceptor（map 包裹）。',
      seeAlso: ['InterceptorsConsumer', 'TransformInterceptor'],
    },
    {
      id: 'iface-exception-filter', kind: 'interface', name: 'ExceptionFilter', pkg: '@nestjs/common',
      path: 'packages/common/interfaces/exceptions/exception-filter.interface.ts', cat: ['contract'],
      summary: '过滤器契约：catch(exception, host: ArgumentsHost)',
      design: [
        '不返回值——直接通过 host.switchToHttp().getResponse() 操作原生响应，最大自由度。与 @Catch 的类型标注配合，完成声明式的"异常 → 处理器"路由。',
      ],
      catsApp: 'HttpExceptionFilter implements ExceptionFilter<HttpException>。',
      seeAlso: ['ExceptionsHandler', 'dec-catch', 'HttpExceptionFilter', 'iface-arguments-host'],
    },
    {
      id: 'iface-arguments-host', kind: 'interface', name: 'ArgumentsHost/ExecutionContext', pkg: '@nestjs/common',
      path: 'packages/common/interfaces/features/arguments-host.interface.ts', cat: ['contract'],
      summary: '跨传输的参数抽象：switchToHttp/Rpc/Ws + getClass/getHandler',
      design: [
        'ArgumentsHost 用 getType() / switchToHttp() / switchToRpc() / switchToWs() 把 (req,res,next) 与 (data,client) 的差异封装掉；ExecutionContext 再附加 getClass() / getHandler() 两个反射入口。',
        '守卫 / 拦截器 / 过滤器因此"写一份就能跨传输工作"——增强器与传输解耦的关键契约。',
      ],
      catsApp: 'RolesGuard 里 context.switchToHttp().getRequest()；HttpExceptionFilter 里 host.switchToHttp().getResponse()。',
      seeAlso: ['GuardsConsumer', 'iface-exception-filter', 'iface-can-activate'],
    },

    /* ================= @nestjs/common · 内置实现 ================= */
    {
      id: 'pipe-validation', kind: 'class', name: 'ValidationPipe', pkg: '@nestjs/common',
      path: 'packages/common/pipes/validation.pipe.ts', cat: ['enhancer'],
      summary: '内置校验管道：class-validator + class-transformer 校验/净化 DTO',
      design: [
        '对 metatype 是 DTO 类的参数：plainToInstance 反序列化 → validate 校验 → 依 whitelist / forbidNonWhitelisted / transform 等选项处理（剔除多余属性 / 报错 / 类型转换）。',
        '把"参数校验"从每个 handler 的样板代码抽成全局横切——这正是管道的定位：值进值出 + 抛异常即中断。校验失败抛 BadRequestException 进入过滤器链。',
      ],
      catsApp: 'main.ts 的 app.useGlobalPipes(new ValidationPipe())，对 @Body() CreateCatDto 生效（DTO 上配合 class-validator 装饰器使用）。',
      seeAlso: ['PipesConsumer', 'ApplicationConfig', 'iface-pipe-transform', 'builtin-parse-pipes'],
    },
    {
      id: 'builtin-parse-pipes', kind: 'class', name: 'ParseInt/ParseBool/…', pkg: '@nestjs/common',
      path: 'packages/common/pipes/parse-int.pipe.ts 等', cat: ['enhancer'],
      summary: '内置标量转换管道：ParseInt/ParseBool/ParseFloat/ParseUUID/ParseArray/DefaultValue',
      design: [
        '一组小而专的转换管道：transform 内解析、失败抛 BadRequestException；DefaultValuePipe 组合缺省值。与 ValidationPipe 互补——标量在参数层转换，对象在 DTO 层校验。',
      ],
      catsApp: '示例自实现了 ParseIntPipe（见 common/pipes/parse-int.pipe.ts），生产可直接用这套内置版。',
      seeAlso: ['pipe-validation', 'PipesConsumer', 'cats-parse-int-pipe'],
    },
    {
      id: 'interceptor-class-serializer', kind: 'class', name: 'ClassSerializerInterceptor', pkg: '@nestjs/common',
      path: 'packages/common/serializer/class-serializer.interceptor.ts', cat: ['enhancer'],
      summary: '响应序列化拦截器：让 class-transformer 装饰器（@Exclude 等）对响应生效',
      design: [
        '在后置 map(instanceToPlain) 中应用 class-transformer 规则，DTO 上的 @Exclude / @Expose / @Transform 因此能控制响应形态；@SerializeOptions 可按路由定制。全局注册时是"响应脱敏"的标准位置。',
      ],
      seeAlso: ['InterceptorsConsumer', 'iface-nest-interceptor'],
    },
    {
      id: 'exception-http', kind: 'class', name: 'HttpException', pkg: '@nestjs/common',
      path: 'packages/common/exceptions/http.exception.ts', cat: ['exception'],
      summary: '带 HTTP 语义的异常基类 + ~25 个状态码子类（NotFoundException…）',
      design: [
        '构造时携带 status 与 response（对象或字符串），getStatus() / getResponse() 供 BaseExceptionFilter 写回。NotFoundException / BadRequestException / ForbiddenException 等子类只是预设状态码的快捷方式。',
        '把"错误也是接口契约的一部分"编码进类型系统：抛出的异常类型即响应形态。',
      ],
      catsApp: '自定义 ParseIntPipe 校验失败抛 BadRequestException("Validation failed") → 400。',
      seeAlso: ['BaseExceptionFilter', 'ExceptionsHandler', 'HttpExceptionFilter'],
    },
    {
      id: 'logger-console', kind: 'class', name: 'Logger/ConsoleLogger', pkg: '@nestjs/common',
      path: 'packages/common/services/logger.service.ts', cat: ['util', 'eco'],
      summary: '日志门面 Logger + 内置 ConsoleLogger（可整体替换）',
      design: [
        'Logger 是可替换的静态门面（Logger.overrideLogger），默认委托 ConsoleLogger（时间戳 / 颜色 / 作用域格式化）。框架内部（Mapped 路由日志、异常记录）与业务共用同一通道——日志形态统一且可整体替换为 winston / pino 适配器。',
      ],
      catsApp: '启动时终端里的 Nest 广告牌与 Mapped {...} 日志、请求日志都经它输出。',
      seeAlso: ['ExceptionHandler', 'RouterExplorer'],
    },

    /* ================= platform-express ================= */
    {
      id: 'ExpressAdapter', kind: 'class', name: 'ExpressAdapter', pkg: '@nestjs/platform-express',
      path: 'packages/platform-express/adapters/express-adapter.ts', cat: ['platform'],
      summary: '包装 express() 实例的适配器：路由/中间件/解析器/监听全落地',
      design: [
        '持有 express() 应用实例：get/post/put/... 直接映射到 app[method]；reply 用 res.status(code).send/json() 落盘；init 时按 getBodyParserOptions 挂 json / urlencoded 解析器；另实现 enableCors / setViewEngine / useStaticAssets / 版本化等抽象点。',
        '@nestjs/core 通过 NestFactory.loadAdapter 运行时 require 它——装了 @nestjs/platform-express 就能用，卸掉则回退提示装 Fastify。同构的 FastifyAdapter（platform-fastify）是可替换实现。',
      ],
      members: [
        ['reply(response, body, statusCode)', '写响应'],
        ['init(httpServer)', '挂 body 解析器'],
        ['listen(port, callback)', 'http.createServer(app).listen'],
      ],
      catsApp: 'main.ts 未指定适配器 → NestFactory 默认懒加载本类；app.listen(3000) 最终是它的 listen。',
      seeAlso: ['AbstractHttpAdapter', 'NestFactoryStatic', 'pkg-express'],
    },

    /* ================= 业务侧 · sample/01-cats-app ================= */
    {
      id: 'pkg-catsapp', kind: 'package', name: 'sample/01-cats-app', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app', cat: ['business'],
      summary: '示例应用：本页全部叙事的主线（最小可运行的完整 Cats CRUD）',
      design: [
        '官方最小示例，但五脏俱全：模块化（AppModule/CatsModule/CoreModule）、控制器与服务分层、全套横切件（守卫/管道/过滤器/中间件/拦截器各至少一个自定义实现）。本页 Stage 1~7 的每一步都以它的启动与请求为主线讲解。',
      ],
      seeAlso: ['cats-main', 'AppModule', 'CatsController'],
    },
    {
      id: 'cats-main', kind: 'file', name: 'main.ts', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/main.ts', cat: ['business'],
      summary: 'bootstrap 启动文件：NestFactory.create → useGlobalPipes → listen',
      design: [
        '业务侧唯一直接接触框架生命周期的文件：NestFactory.create(AppModule) 完成全部装配，useGlobalPipes 登记全局管道，listen(3000) 拉起 HTTP。保持 main.ts 极简是 Nest 的约定——装配细节全部沉入框架，业务只写"声明"。',
      ],
      catsApp: '三行核心代码即 Stage 2 的叙事主线：create → useGlobalPipes → listen。',
      seeAlso: ['NestFactoryStatic', 'NestApplication', 'pipe-validation'],
    },
    {
      id: 'AppModule', kind: 'class', name: 'AppModule', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/app.module.ts', cat: ['business'],
      summary: '根模块：imports [CoreModule, CatsModule]（组合根）',
      design: [
        '组合根（Composition Root）：只负责把子模块拼成应用。@Module({ imports }) 的声明被 DependenciesScanner 递归展开。CoreModule 在前提供全局拦截器，CatsModule 提供业务能力。',
        '根模块还可以实现 NestModule.configure 来声明中间件（LoggerMiddleware 的推荐挂载点）；单元测试则通过 Test.createTestingModule({ imports: [AppModule] }) 复用整个组合。',
      ],
      seeAlso: ['dec-module', 'DependenciesScanner', 'CoreModule', 'CatsModule', 'LoggerMiddleware'],
    },
    {
      id: 'CatsModule', kind: 'class', name: 'CatsModule', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/cats/cats.module.ts', cat: ['business'],
      summary: '特性模块：controllers [CatsController] + providers [CatsService]',
      design: [
        '按"特性内聚"划分：控制器与服务同模块，服务不需要 exports（仅模块内使用）。若跨模块共享，加 exports: [CatsService] 即可——可见性由模块边界控制，而不是全局单例注册表，这是 Nest 与传统 IoC 的关键差异。',
      ],
      seeAlso: ['dec-module', 'CatsController', 'CatsService'],
    },
    {
      id: 'CoreModule', kind: 'class', name: 'CoreModule', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/core/core.module.ts', cat: ['business'],
      summary: '应用级横切配置模块：APP_INTERCEPTOR 注册两个全局拦截器',
      design: [
        '用 { provide: APP_INTERCEPTOR, useClass } 把 TransformInterceptor、LoggingInterceptor 注册为请求作用域的全局拦截器——与 main.ts 的 useGlobalPipes 是两种全局增强器注册路径（配置式 vs 命令式），最终都汇入 ApplicationConfig，由扫描器/工厂分别写入。',
      ],
      seeAlso: ['InterceptorsContextCreator', 'ApplicationConfig', 'DependenciesScanner', 'TransformInterceptor', 'LoggingInterceptor'],
    },
    {
      id: 'CatsController', kind: 'class', name: 'CatsController', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/cats/cats.controller.ts', cat: ['business'],
      summary: '控制器：/cats 路由（create/findAll/findOne），横切件示范场',
      design: [
        '演示了典型组合：类级 @UseGuards(RolesGuard)、@Post + @Roles(["admin"]) 元数据、@Get(":id") + 内联 ParseIntPipe。控制器保持"薄"——只做参数接收与委托 CatsService，这是 Nest 分层的示范。',
        '它的每个装饰器在框架侧都有一条对应处理链：@Controller→PathsExplorer、@Get→RoutePathFactory、@Param→RouteParamsFactory、@UseGuards→GuardsContextCreator。',
      ],
      seeAlso: ['dec-controller', 'RolesGuard', 'CatsService', 'RouterExecutionContext', 'cats-parse-int-pipe'],
    },
    {
      id: 'CatsService', kind: 'class', name: 'CatsService', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/cats/cats.service.ts', cat: ['business'],
      summary: '业务服务：内存 cats 数组的 create/findAll（@Injectable 单例）',
      design: [
        '@Injectable 标记后由 Injector 实例化为单例，构造注入到 CatsController。业务逻辑与 HTTP 完全解耦——可被任何控制器/定时任务复用，也方便 @nestjs/testing 做 overrideProvider 替身。',
      ],
      seeAlso: ['dec-injectable', 'Injector', 'CatsController', 'InstanceWrapper'],
    },
    {
      id: 'RolesGuard', kind: 'class', name: 'RolesGuard', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/common/guards/roles.guard.ts', cat: ['business'],
      summary: '类级守卫示范：读 @Roles 元数据校验用户角色',
      design: [
        '注入 Reflector 读 @Roles(["admin"])（无声明则放行），从 request.user 取角色比对。展示了自定义守卫的标准三件配合：元数据声明（装饰器）+ 运行时读取（Reflector）+ 请求上下文（ExecutionContext）。',
      ],
      seeAlso: ['dec-setmetadata', 'Reflector', 'GuardsConsumer', 'iface-can-activate'],
    },
    {
      id: 'LoggerMiddleware', kind: 'class', name: 'LoggerMiddleware', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/common/middleware/logger.middleware.ts', cat: ['business'],
      summary: '中间件示范：implements NestMiddleware，打印请求日志',
      design: [
        'implements NestMiddleware 的 use(req, res, next)。中间件与守卫的分工：中间件处理"通用预处理"（日志/CORS），不感知 Nest 路由元数据；守卫处理"业务鉴权"，可读装饰器元数据——选型依据是"要不要读元数据"。',
      ],
      seeAlso: ['MiddlewareModule', 'MiddlewareBuilder'],
    },
    {
      id: 'cats-parse-int-pipe', kind: 'class', name: 'ParseIntPipe(cats)', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/common/pipes/parse-int.pipe.ts', cat: ['business'],
      summary: '自实现管道示范：":id" 字符串 → number，失败抛 400',
      design: [
        'transform 里 parseInt，NaN 抛 BadRequestException("Validation failed")。以 @Param("id", new ParseIntPipe()) 内联实例传入——参数级管道的最小示例；生产可直接用 @nestjs/common 内置版（本仓库 common/pipes/validation.pipe.ts 还示范了自实现 ValidationPipe）。',
      ],
      seeAlso: ['PipesConsumer', 'route-params-decorators', 'builtin-parse-pipes'],
    },
    {
      id: 'HttpExceptionFilter', kind: 'class', name: 'HttpExceptionFilter', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/common/filters/http-exception.filter.ts', cat: ['business'],
      summary: '过滤器示范：把 HttpException 统一 JSON 化（statusCode/timestamp/path）',
      design: [
        '@Catch(HttpException) + catch 里经 ArgumentsHost 取原生 response/request，输出统一 JSON 结构。展示了过滤器的定位：最后的响应整形，替代框架默认错误体——与拦截器的 catchError（ErrorsInterceptor，见 common/interceptors/）形成"拦截 vs 兜底"互补。',
      ],
      seeAlso: ['iface-exception-filter', 'ExceptionsHandler', 'dec-catch', 'exception-http'],
    },
    {
      id: 'TransformInterceptor', kind: 'class', name: 'TransformInterceptor', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/core/interceptors/transform.interceptor.ts', cat: ['business'],
      summary: '拦截器示范：响应包裹为 { data: ... }（map 后置改写）',
      design: [
        'next.handle().pipe(map(data => ({ data })))——演示拦截器的"后置"能力：在 handler 返回后、响应写出前改写数据形态。经 CoreModule 的 APP_INTERCEPTOR 全局注册，对所有路由生效。',
      ],
      seeAlso: ['InterceptorsConsumer', 'CoreModule', 'iface-nest-interceptor', 'LoggingInterceptor'],
    },
    {
      id: 'LoggingInterceptor', kind: 'class', name: 'LoggingInterceptor', pkg: 'sample/01-cats-app',
      path: 'sample/01-cats-app/src/core/interceptors/logging.interceptor.ts', cat: ['business'],
      summary: '拦截器示范：tap 计时日志（Before/After + 耗时）',
      design: [
        'tap 打印 Before / After 与耗时，不改数据流——演示拦截器的"观察"能力：不参与数据变换也能介入。同目录思想延伸：common/interceptors 里的 TimeoutInterceptor（timeout(5000) 超时熔断）与 ErrorsInterceptor（catchError 统一改写异常）展示了 RxJS 操作符的组合威力。',
      ],
      seeAlso: ['InterceptorsConsumer', 'CoreModule', 'TransformInterceptor'],
    },

    /* ================= 包级节点（Stage 0 总览） ================= */
    {
      id: 'pkg-common', kind: 'package', name: '@nestjs/common', pkg: '@nestjs/common',
      path: 'packages/common', cat: ['contract', 'decorator'],
      summary: '用户面：装饰器 / 契约接口 / 内置管道与异常 / 工具（无运行时依赖）',
      design: [
        '被 core 与所有平台包依赖的最底层包：所有 @ 装饰器、四件套接口（PipeTransform/CanActivate/NestInterceptor/ExceptionFilter）、HttpException 家族、内置管道/拦截器、Logger、HttpServer 接口都在这里。',
        '框架把"用户面"与"运行时"拆成两个包：业务代码 import 的主要是 common，它不含任何启动/路由机器，可被浏览器端、工具链（SWC 编译装饰器）安全引用。',
      ],
      seeAlso: ['pkg-core', 'dec-module', 'iface-pipe-transform', 'exception-http'],
    },
    {
      id: 'pkg-core', kind: 'package', name: '@nestjs/core', pkg: '@nestjs/core',
      path: 'packages/core', cat: ['bootstrap', 'container'],
      summary: '运行时：扫描 / 依赖注入 / 路由 / 增强器 / 异常——Stage 2~7 的主角',
      design: [
        '一次 NestFactory.create 背后的全部机器：scanner / injector / router / middleware / guards / pipes / interceptors / exceptions / adapters。本页 Stage 2~7 的绝大多数类都在这个包。',
        '只显式依赖 @nestjs/common，对平台包（express/fastify/socket.io/ws）全部采用运行时懒加载——依赖图保持"core 不认识任何平台"的形态。',
      ],
      seeAlso: ['pkg-common', 'pkg-express', 'NestFactoryStatic', 'NestContainer'],
    },
    {
      id: 'pkg-express', kind: 'package', name: '@nestjs/platform-express', pkg: '@nestjs/platform-express',
      path: 'packages/platform-express', cat: ['platform'],
      summary: '默认 HTTP 平台：ExpressAdapter + Multer 文件上传全家桶',
      design: [
        '提供默认 HTTP 平台：ExpressAdapter 以及文件上传（MulterModule / FileInterceptor / FilesInterceptor…）。core 不直接依赖它（运行时 require），同构的 platform-fastify 是可替换实现——平台包的职责边界就是"实现 AbstractHttpAdapter 的抽象点 + 平台专属能力"。',
      ],
      seeAlso: ['ExpressAdapter', 'AbstractHttpAdapter', 'pkg-core'],
    },
    {
      id: 'pkg-testing', kind: 'package', name: '@nestjs/testing', pkg: '@nestjs/testing',
      path: 'packages/testing', cat: ['test'],
      summary: '测试工具：Test.createTestingModule / provider 覆盖与 mock（见 Stage 8）',
      design: [
        '以"覆盖容器"的方式复用生产 DI：overrideProvider / useMocker 在编译时替换 wrapper，产出测试专用上下文 TestingModule。细节见 Stage 8。',
      ],
      seeAlso: ['Test', 'TestingModule', 'pkg-core'],
    },
    {
      id: 'pkg-websockets', kind: 'package', name: '@nestjs/websockets', pkg: '@nestjs/websockets',
      path: 'packages/websockets', cat: ['eco'],
      summary: 'WebSocket 子系统：网关扫描 / 适配器抽象（平台差异下沉到 platform-*）',
      design: [
        'SocketModule 在启动时扫描 @WebSocketGateway，经 WebSocketsController 建服务器并绑定 @SubscribeMessage；平台差异（socket.io / ws）封装在 WebSocketAdapter 的平台实现里（platform-socket.io / platform-ws）。',
      ],
      seeAlso: ['SocketModule', 'WebSocketsController', 'pkg-core'],
    },
    {
      id: 'pkg-microservices', kind: 'package', name: '@nestjs/microservices', pkg: '@nestjs/microservices',
      path: 'packages/microservices', cat: ['eco'],
      summary: '微服务子系统：ClientProxy / Server 传输族（TCP/Redis/NATS/MQTT/gRPC/RMQ/Kafka）',
      design: [
        'NestMicroservice / MicroservicesModule + 各传输的 ClientProxy 与 Server 实现；@MessagePattern / @EventPattern 声明式路由，ServerFactory 按传输实例化。与 HTTP 共享同一套增强器管道（经 ExternalContextCreator）。',
      ],
      seeAlso: ['NestMicroservice', 'MicroservicesModule', 'ClientProxy', 'Server'],
    },

    /* ================= testing / ws / ms / hooks（Stage 8） ================= */
    {
      id: 'Test', kind: 'class', name: 'Test', pkg: '@nestjs/testing',
      path: 'packages/testing/test.ts', cat: ['test'],
      summary: '测试入口：Test.createTestingModule(metadata) → TestingModuleBuilder',
      design: [
        '唯一的静态入口 createTestingModule ——测试上下文里的"NestFactory"，把用户与复杂的覆盖机制隔离开。',
      ],
      catsApp: 'cats.service.spec.ts / cats.controller.spec.ts 里 Test.createTestingModule({...}) 即它。',
      seeAlso: ['TestingModuleBuilder', 'TestingModule'],
    },
    {
      id: 'TestingModuleBuilder', kind: 'class', name: 'TestingModuleBuilder', pkg: '@nestjs/testing',
      path: 'packages/testing/testing-module.builder.ts', cat: ['test'],
      summary: '流式构建器：overrideProvider / overrideModule / useMocker / compile',
      design: [
        'collectOverrides 把"改哪个 provider、怎么改（值/类/工厂/自动 mock）"收集成声明式数据，compile() 再把 metadata + overrides 一起编译为 TestingModule。把变更点做成可链式声明的数据，是覆盖机制可组合的原因。',
      ],
      seeAlso: ['Test', 'TestingModule', 'TestingInjector'],
    },
    {
      id: 'TestingModule', kind: 'class', name: 'TestingModule', pkg: '@nestjs/testing',
      path: 'packages/testing/testing-module.ts', cat: ['test'],
      summary: '测试上下文：继承 NestApplicationContext，支持运行期 override',
      design: [
        '继承应用上下文（get / resolve / select 全部可用），额外提供动态 overrideProvider——测试里替代 NestApplication 的角色：不监听端口、可用 TestingLoggerService 静音日志。',
      ],
      seeAlso: ['Test', 'TestingModuleBuilder', 'NestApplicationContext'],
    },
    {
      id: 'TestingInjector', kind: 'class', name: 'TestingInjector', pkg: '@nestjs/testing',
      path: 'packages/testing/testing-injector.ts', cat: ['test'],
      summary: '支持 provider 覆盖/mock 的注入器（extends Injector）',
      design: [
        'extends 生产 Injector：实例化时查询 override 表——被覆盖的 wrapper 换成 mock 值 / 类 / 工厂，其余照常走生产逻辑。"薄拦截"而非重写，保证测试注入行为与生产一致。',
      ],
      seeAlso: ['TestingModuleBuilder', 'Injector', 'TestingModule'],
    },
    {
      id: 'SocketModule', kind: 'class', name: 'SocketModule', pkg: '@nestjs/websockets',
      path: 'packages/websockets/socket-module.ts', cat: ['eco'],
      summary: 'WS 子系统启动桥：扫描网关、接管生命周期与关闭',
      design: [
        'register(container, ...) 扫描 @WebSocketGateway provider 交给 WebSocketsController；close 时统一关闭服务器。与 MiddlewareModule 同为 NestApplication.init 拉起的可选子系统——"子系统即插拔"的组织方式。',
      ],
      seeAlso: ['WebSocketsController', 'NestApplication'],
    },
    {
      id: 'WebSocketsController', kind: 'class', name: 'WebSocketsController', pkg: '@nestjs/websockets',
      path: 'packages/websockets/web-sockets-controller.ts', cat: ['eco'],
      summary: '为每个网关创建 server 并绑定 @SubscribeMessage 处理',
      design: [
        '挂钩网关实例的生命周期（OnGatewayInit/Connection/Disconnect），用平台 WebSocketAdapter 建 server；消息处理经 ExternalContextCreator 包成与 HTTP 同构的管道——守卫/拦截器/过滤器跨传输复用。',
      ],
      seeAlso: ['SocketModule', 'ExternalContextCreator'],
    },
    {
      id: 'NestMicroservice', kind: 'class', name: 'NestMicroservice', pkg: '@nestjs/microservices',
      path: 'packages/microservices/nest-microservice.ts', cat: ['eco'],
      summary: '微服务应用上下文：listen 走 Server（监听 pattern）而非 HTTP 端口',
      design: [
        'extends NestApplicationContext；listen() 委托注入的 Server。与 NestApplication 平级的另一种"应用形态"——因为共享上下文基类，DI / 钩子 / 关闭逻辑全部复用。',
      ],
      seeAlso: ['NestApplicationContext', 'Server', 'MicroservicesModule'],
    },
    {
      id: 'MicroservicesModule', kind: 'class', name: 'MicroservicesModule', pkg: '@nestjs/microservices',
      path: 'packages/microservices/microservices-module.ts', cat: ['eco'],
      summary: '微服务桥：setupListeners 绑 @MessagePattern、setupClients 注入 @Client',
      design: [
        '静态模块三件事：register 收集 server 配置并实例化；setupListeners 扫描 @MessagePattern / @EventPattern 处理器绑定到各 Server；setupClients 把 @Client 属性替换为 ClientProxy 实例——客户端与服务器在同一套元数据机制下工作。',
      ],
      seeAlso: ['NestMicroservice', 'ClientProxy', 'Server', 'NestApplication'],
    },
    {
      id: 'ClientProxy', kind: 'class', name: 'ClientProxy', pkg: '@nestjs/microservices',
      path: 'packages/microservices/client/client-proxy.ts', cat: ['eco'],
      summary: 'RPC 客户端抽象基类：send/emit；各传输子类只实现连接原语',
      design: [
        'send(pattern, data) 返回冷 Observable（订阅才真正发出）；emit 是事件语义不等待响应。ClientTCP / ClientRedis / ClientNats / ClientKafka… 只实现 connect / dispatch 等原语——业务面向抽象编程，换传输不改调用方。',
      ],
      seeAlso: ['MicroservicesModule', 'Server'],
    },
    {
      id: 'Server', kind: 'class', name: 'Server', pkg: '@nestjs/microservices',
      path: 'packages/microservices/server/server.ts', cat: ['eco'],
      summary: '传输服务器抽象基类：把 pattern 路由到 handler（ServerFactory 按传输实例化）',
      design: [
        '各 ServerTCP / ServerRedis / ServerGrpc… 的基类：持有 handler 注册表，按 pattern 匹配分发；异常经 RpcExceptionsHandler。与 ClientProxy 一起构成"传输无关的 RPC 语义"。',
      ],
      seeAlso: ['NestMicroservice', 'MicroservicesModule', 'ClientProxy'],
    },
    {
      id: 'lifecycle-hooks', kind: 'interface', name: 'OnModuleInit/…', pkg: '@nestjs/common',
      path: 'packages/common/interfaces/hooks/on-init.interface.ts 等', cat: ['contract'],
      summary: '生命周期接口：OnModuleInit/Destroy/OnApplicationBootstrap/Shutdown…',
      design: [
        '五个可选接口分布在 interfaces/hooks/：init / destroy / bootstrap / shutdown 阶段各就各位。接口而非装饰器——实现是零成本的（TS 结构类型），框架用 instanceof 检测是否实现。',
        '钩子的调用次序由 TopologyTree 的距离分层保证（见 NestApplicationContext），开发者从不手写初始化顺序。',
      ],
      catsApp: '任何 provider 实现 onModuleInit() 都会在 listen 前被调用。',
      seeAlso: ['hooks-functions', 'NestApplicationContext'],
    },
    {
      id: 'hooks-functions', kind: 'functionGroup', name: 'hooks/* 函数组', pkg: '@nestjs/core',
      path: 'packages/core/hooks/on-module-init.hook.ts 等', cat: ['bootstrap'],
      summary: 'callModuleInitHook / callModuleBootstrapHook… 按 TopologyTree 分层触发',
      design: [
        '纯函数组（刻意不用类）：callModuleInitHook / callModuleDestroyHook / callAppBootstrapHook / callBeforeAppShutdownHook / callAppShutdownHook。TopologyTree.walk 按深度分层遍历各模块实例触发——"确定性初始化/销毁次序"的实现体，被 NestApplicationContext 调用。',
      ],
      seeAlso: ['NestApplicationContext', 'TopologyTree', 'lifecycle-hooks'],
    },
  ],

  edges: [
    /* ---- Stage 0 · 包依赖总览 ---- */
    { from: 'pkg-core', to: 'pkg-common', type: 'depends', label: '依赖：装饰器/契约/工具', stages: [0] },
    { from: 'pkg-express', to: 'pkg-core', type: 'depends', label: '实现平台适配器', stages: [0] },
    { from: 'pkg-websockets', to: 'pkg-core', type: 'depends', label: '', stages: [0] },
    { from: 'pkg-microservices', to: 'pkg-core', type: 'depends', label: '', stages: [0] },
    { from: 'pkg-testing', to: 'pkg-core', type: 'depends', label: '复用生产 DI', stages: [0] },
    { from: 'pkg-catsapp', to: 'pkg-core', type: 'depends', label: 'NestFactory.create', stages: [0] },
    { from: 'pkg-catsapp', to: 'pkg-common', type: 'depends', label: '装饰器/管道', stages: [0] },
    { from: 'pkg-catsapp', to: 'pkg-express', type: 'depends', label: '默认适配器(懒加载)', stages: [0] },
    { from: 'pkg-catsapp', to: 'pkg-testing', type: 'depends', label: 'spec 单测', stages: [0] },

    /* ---- Stage 1 · 编译期：装饰器写元数据 ---- */
    { from: 'AppModule', to: 'dec-module', type: 'annotates', label: '@Module 元数据', stages: [1] },
    { from: 'CatsModule', to: 'dec-module', type: 'annotates', label: '@Module 元数据', stages: [1] },
    { from: 'CoreModule', to: 'dec-module', type: 'annotates', label: '@Module 元数据', stages: [1] },
    { from: 'CatsService', to: 'dec-injectable', type: 'annotates', label: '@Injectable', stages: [1] },
    { from: 'CatsController', to: 'dec-controller', type: 'annotates', label: '@Controller("cats")', stages: [1] },
    { from: 'CatsController', to: 'http-method-decorators', type: 'annotates', label: '@Get/@Post', stages: [1] },
    { from: 'CatsController', to: 'route-params-decorators', type: 'annotates', label: '@Body/@Param', stages: [1] },
    { from: 'CatsController', to: 'use-enhancers-decorators', type: 'annotates', label: '@UseGuards', stages: [1] },
    { from: 'RolesGuard', to: 'dec-setmetadata', type: 'reads', label: '@Roles 由 createDecorator 生成', stages: [1] },
    { from: 'dec-module', to: 'common-constants', type: 'annotates', label: 'MODULE_METADATA', stages: [1] },
    { from: 'dec-controller', to: 'common-constants', type: 'annotates', label: 'PATH/CONTROLLER_WATERMARK', stages: [1] },
    { from: 'dec-injectable', to: 'common-constants', type: 'annotates', label: 'INJECTABLE_WATERMARK', stages: [1] },
    { from: 'http-method-decorators', to: 'common-constants', type: 'annotates', label: 'METHOD_METADATA', stages: [1] },
    { from: 'route-params-decorators', to: 'common-constants', type: 'annotates', label: 'ROUTE_ARGS_METADATA', stages: [1] },
    { from: 'dec-setmetadata', to: 'common-constants', type: 'annotates', label: '自定义 key', stages: [1] },
    { from: 'dec-catch', to: 'common-constants', type: 'annotates', label: 'FILTER_CATCH', stages: [1] },
    { from: 'dec-global', to: 'dec-module', type: 'uses', label: '组合于模块类', stages: [1] },
    { from: 'cats-main', to: 'AppModule', type: 'depends', label: 'create(AppModule)', stages: [1] },

    /* ---- Stage 2 · 引导启动 ---- */
    { from: 'cats-main', to: 'NestFactoryStatic', type: 'calls', label: 'NestFactory.create()', stages: [2] },
    { from: 'NestFactoryStatic', to: 'ApplicationConfig', type: 'creates', label: '', stages: [2] },
    { from: 'NestFactoryStatic', to: 'NestContainer', type: 'creates', label: 'IoC 容器', stages: [2] },
    { from: 'NestFactoryStatic', to: 'DependenciesScanner', type: 'creates', label: '扫描器', stages: [2] },
    { from: 'NestFactoryStatic', to: 'InstanceLoader', type: 'creates', label: '加载器', stages: [2] },
    { from: 'NestFactoryStatic', to: 'NestApplication', type: 'creates', label: '装配完成后返回', stages: [2] },
    { from: 'NestFactoryStatic', to: 'AbstractHttpAdapter', type: 'creates', label: 'loadAdapter 懒加载', stages: [2] },
    { from: 'ExpressAdapter', to: 'AbstractHttpAdapter', type: 'extends', label: '平台实现', stages: [2] },
    { from: 'NestApplication', to: 'NestApplicationContext', type: 'extends', label: '', stages: [2] },
    { from: 'NestApplication', to: 'ApplicationConfig', type: 'registers', label: 'useGlobalPipes 登记', stages: [2] },
    { from: 'NestApplication', to: 'MiddlewareModule', type: 'calls', label: 'init(): 注册中间件', stages: [2] },
    { from: 'NestApplication', to: 'RoutesResolver', type: 'calls', label: 'init(): 注册路由', stages: [2] },
    { from: 'RoutesResolver', to: 'ExpressAdapter', type: 'registers', label: '挂载路由/404 兜底', stages: [2] },
    { from: 'MiddlewareModule', to: 'ExpressAdapter', type: 'registers', label: '挂载中间件', stages: [2] },
    { from: 'NestApplication', to: 'ExpressAdapter', type: 'calls', label: 'listen(3000)', stages: [2] },
    { from: 'NestApplication', to: 'InternalProvidersStorage', type: 'registers', label: 'registerHttpServer', stages: [2] },
    { from: 'NestFactoryStatic', to: 'ExceptionsZone', type: 'calls', label: 'asyncRun 包裹', stages: [2] },
    { from: 'ExceptionsZone', to: 'ExceptionHandler', type: 'calls', label: '记录后退出', stages: [2] },
    { from: 'DependenciesScanner', to: 'NestContainer', type: 'registers', label: 'scan → addModule', stages: [2] },
    { from: 'InstanceLoader', to: 'NestContainer', type: 'resolves', label: '逐模块实例化', stages: [2] },

    /* ---- Stage 3 · 扫描与模块容器 ---- */
    { from: 'DependenciesScanner', to: 'AppModule', type: 'scans', label: 'scan 入口模块', stages: [3] },
    { from: 'AppModule', to: 'CatsModule', type: 'depends', label: 'imports', stages: [3] },
    { from: 'AppModule', to: 'CoreModule', type: 'depends', label: 'imports', stages: [3] },
    { from: 'DependenciesScanner', to: 'MetadataScanner', type: 'calls', label: '方法级扫描', stages: [3] },
    { from: 'DependenciesScanner', to: 'ModuleCompiler', type: 'calls', label: '编译每个 import', stages: [3] },
    { from: 'ModuleCompiler', to: 'ByReferenceModuleOpaqueKeyFactory', type: 'calls', label: '默认 token 策略', stages: [3] },
    { from: 'ModuleCompiler', to: 'DeepHashedModuleOpaqueKeyFactory', type: 'calls', label: 'deep-hash 模式', stages: [3] },
    { from: 'DependenciesScanner', to: 'NestContainer', type: 'registers', label: '模块入容器', stages: [3] },
    { from: 'NestContainer', to: 'ModulesContainer', type: 'creates', label: 'Map<token, Module>', stages: [3] },
    { from: 'NestContainer', to: 'Module', type: 'creates', label: '每模块一个', stages: [3] },
    { from: 'Module', to: 'InstanceWrapper', type: 'creates', label: '包装每个成员', stages: [3] },
    { from: 'DependenciesScanner', to: 'InternalCoreModule', type: 'registers', label: '最先注册', stages: [3] },
    { from: 'InternalCoreModule', to: 'Reflector', type: 'provides', label: '全局可注入', stages: [3] },
    { from: 'DependenciesScanner', to: 'TopologyTree', type: 'uses', label: '计算模块距离', stages: [3] },
    { from: 'CoreModule', to: 'DependenciesScanner', type: 'registers', label: 'APP_INTERCEPTOR→全局增强器', stages: [3] },

    /* ---- Stage 4 · 依赖注入与实例化 ---- */
    { from: 'InstanceLoader', to: 'Injector', type: 'calls', label: '实例化委托', stages: [4] },
    { from: 'InstanceLoader', to: 'Module', type: 'uses', label: '逐模块遍历', stages: [4] },
    { from: 'Module', to: 'InstanceWrapper', type: 'uses', label: '成员包装', stages: [4] },
    { from: 'Injector', to: 'InstanceWrapper', type: 'resolves', label: '读/写实例缓存', stages: [4] },
    { from: 'Injector', to: 'SettlementSignal', type: 'uses', label: '循环依赖等待', stages: [4] },
    { from: 'Injector', to: 'CatsService', type: 'creates', label: '先实例化 provider', stages: [4] },
    { from: 'Injector', to: 'CatsController', type: 'creates', label: '再实例化 controller', stages: [4] },
    { from: 'CatsService', to: 'CatsController', type: 'resolves', label: '构造注入', stages: [4] },
    { from: 'ModuleRef', to: 'AbstractInstanceResolver', type: 'extends', label: '', stages: [4] },
    { from: 'ModuleRef', to: 'InstanceLinksHost', type: 'uses', label: '快速查找', stages: [4] },
    { from: 'ModuleRef', to: 'Injector', type: 'calls', label: 'instantiateClass', stages: [4] },
    { from: 'InstanceLinksHost', to: 'InstanceWrapper', type: 'reads', label: '索引包装', stages: [4] },
    { from: 'LazyModuleLoader', to: 'Injector', type: 'uses', label: '专属注入器', stages: [4] },
    { from: 'ModuleRef', to: 'Module', type: 'creates', label: '每模块绑定一个子类', stages: [4] },

    /* ---- Stage 5 · 中间件与路由注册 ---- */
    { from: 'AppModule', to: 'MiddlewareModule', type: 'implements', label: 'NestModule.configure', stages: [5] },
    { from: 'MiddlewareModule', to: 'MiddlewareContainer', type: 'creates', label: '', stages: [5] },
    { from: 'MiddlewareModule', to: 'MiddlewareBuilder', type: 'creates', label: '传给 configure()', stages: [5] },
    { from: 'MiddlewareBuilder', to: 'RoutesMapper', type: 'calls', label: 'forRoutes 解析', stages: [5] },
    { from: 'RoutesMapper', to: 'PathsExplorer', type: 'uses', label: '读控制器路径', stages: [5] },
    { from: 'MiddlewareBuilder', to: 'RouteInfoPathExtractor', type: 'calls', label: '展开路径', stages: [5] },
    { from: 'RouteInfoPathExtractor', to: 'RoutePathFactory', type: 'uses', label: '统一拼前缀', stages: [5] },
    { from: 'MiddlewareModule', to: 'MiddlewareResolver', type: 'calls', label: '实例化中间件', stages: [5] },
    { from: 'MiddlewareResolver', to: 'LoggerMiddleware', type: 'creates', label: 'Injector.loadMiddleware', stages: [5] },
    { from: 'MiddlewareModule', to: 'RouterProxy', type: 'uses', label: '异常包装', stages: [5] },
    { from: 'MiddlewareModule', to: 'ExpressAdapter', type: 'registers', label: 'adapter.use 挂载', stages: [5] },
    { from: 'RoutesResolver', to: 'RouterExplorer', type: 'calls', label: '逐控制器注册', stages: [5] },
    { from: 'RouterExplorer', to: 'PathsExplorer', type: 'calls', label: '扫方法路由', stages: [5] },
    { from: 'PathsExplorer', to: 'CatsController', type: 'reads', label: '@Get/@Post 元数据', stages: [5] },
    { from: 'RouterExplorer', to: 'RoutePathFactory', type: 'calls', label: '拼最终路径', stages: [5] },
    { from: 'RouterExplorer', to: 'RouterMethodFactory', type: 'calls', label: '方法名映射', stages: [5] },
    { from: 'RouterExplorer', to: 'RouterProxy', type: 'uses', label: '包装 handler', stages: [5] },
    { from: 'RouterExplorer', to: 'RouterExceptionFilters', type: 'creates', label: '每路由过滤器链', stages: [5] },
    { from: 'RouterProxy', to: 'ExpressAdapter', type: 'registers', label: 'get/post 挂载', stages: [5] },

    /* ---- Stage 6 · 请求生命周期 ---- */
    { from: 'ExpressAdapter', to: 'LoggerMiddleware', type: 'calls', label: '中间件先于路由', stages: [6] },
    { from: 'LoggerMiddleware', to: 'RouterProxy', type: 'calls', label: 'next() 进路由', stages: [6] },
    { from: 'RouterProxy', to: 'RouterExecutionContext', type: 'calls', label: '执行编译好的管道', stages: [6] },
    { from: 'RouterExecutionContext', to: 'GuardsConsumer', type: 'calls', label: '① 守卫链', stages: [6] },
    { from: 'GuardsConsumer', to: 'RolesGuard', type: 'calls', label: 'tryActivate', stages: [6] },
    { from: 'RolesGuard', to: 'Reflector', type: 'reads', label: '@Roles 元数据', stages: [6] },
    { from: 'GuardsConsumer', to: 'iface-arguments-host', type: 'creates', label: '构造执行上下文', stages: [6] },
    { from: 'RouterExecutionContext', to: 'InterceptorsConsumer', type: 'calls', label: '② 拦截器(前置)', stages: [6] },
    { from: 'InterceptorsConsumer', to: 'TransformInterceptor', type: 'calls', label: 'map 改写', stages: [6] },
    { from: 'InterceptorsConsumer', to: 'LoggingInterceptor', type: 'calls', label: 'tap 计时', stages: [6] },
    { from: 'InterceptorsConsumer', to: 'CatsController', type: 'calls', label: 'handle() 触发', stages: [6] },
    { from: 'RouterExecutionContext', to: 'RouteParamsFactory', type: 'calls', label: '③ 提取参数', stages: [6] },
    { from: 'RouteParamsFactory', to: 'route-params-decorators', type: 'reads', label: 'ROUTE_ARGS 元数据', stages: [6] },
    { from: 'RouterExecutionContext', to: 'PipesConsumer', type: 'calls', label: '④ 管道转换', stages: [6] },
    { from: 'PipesConsumer', to: 'ParamsTokenFactory', type: 'uses', label: '参数分类', stages: [6] },
    { from: 'PipesConsumer', to: 'cats-parse-int-pipe', type: 'uses', label: '":id" → number', stages: [6] },
    { from: 'RouterExecutionContext', to: 'CatsController', type: 'calls', label: '⑤ 执行 handler', stages: [6] },
    { from: 'RouterExecutionContext', to: 'RouterResponseController', type: 'calls', label: '⑥ 写响应', stages: [6] },
    { from: 'RouterResponseController', to: 'SseStream', type: 'creates', label: '@Sse 流', stages: [6] },
    { from: 'RouterResponseController', to: 'ExpressAdapter', type: 'calls', label: 'reply 落盘', stages: [6] },
    { from: 'TransformInterceptor', to: 'RouterResponseController', type: 'feeds', label: '改写后的数据', stages: [6] },
    { from: 'RouterProxy', to: 'ExceptionsHandler', type: 'throws-to', label: 'catch 一切异常', stages: [6] },
    { from: 'ExceptionsHandler', to: 'HttpExceptionFilter', type: 'calls', label: '@Catch 链', stages: [6] },
    { from: 'ExceptionsHandler', to: 'BaseExceptionFilter', type: 'extends', label: '兜底实现', stages: [6] },
    { from: 'ExceptionsHandler', to: 'exception-http', type: 'reads', label: 'getStatus/getResponse', stages: [6] },

    /* ---- Stage 7 · 增强器四件套 ---- */
    { from: 'ApplicationConfig', to: 'GuardsContextCreator', type: 'feeds', label: 'globalGuards', stages: [7] },
    { from: 'ApplicationConfig', to: 'PipesContextCreator', type: 'feeds', label: 'globalPipes', stages: [7] },
    { from: 'ApplicationConfig', to: 'InterceptorsContextCreator', type: 'feeds', label: 'globalInterceptors', stages: [7] },
    { from: 'ApplicationConfig', to: 'BaseExceptionFilterContext', type: 'feeds', label: 'globalFilters', stages: [7] },
    { from: 'GuardsContextCreator', to: 'ContextCreator', type: 'extends', label: '模板方法', stages: [7] },
    { from: 'PipesContextCreator', to: 'ContextCreator', type: 'extends', label: '', stages: [7] },
    { from: 'InterceptorsContextCreator', to: 'ContextCreator', type: 'extends', label: '', stages: [7] },
    { from: 'BaseExceptionFilterContext', to: 'ContextCreator', type: 'extends', label: '', stages: [7] },
    { from: 'GuardsContextCreator', to: 'GuardsConsumer', type: 'feeds', label: '产出守卫实例', stages: [7] },
    { from: 'PipesContextCreator', to: 'PipesConsumer', type: 'feeds', label: '产出管道实例', stages: [7] },
    { from: 'InterceptorsContextCreator', to: 'InterceptorsConsumer', type: 'feeds', label: '产出拦截器实例', stages: [7] },
    { from: 'PipesConsumer', to: 'ParamsTokenFactory', type: 'uses', label: '参数分类', stages: [7] },
    { from: 'PipesConsumer', to: 'pipe-validation', type: 'uses', label: '全局校验(cats 注册)', stages: [7] },
    { from: 'RolesGuard', to: 'iface-can-activate', type: 'implements', label: '', stages: [7] },
    { from: 'cats-parse-int-pipe', to: 'iface-pipe-transform', type: 'implements', label: '', stages: [7] },
    { from: 'pipe-validation', to: 'iface-pipe-transform', type: 'implements', label: '', stages: [7] },
    { from: 'builtin-parse-pipes', to: 'iface-pipe-transform', type: 'implements', label: '', stages: [7] },
    { from: 'TransformInterceptor', to: 'iface-nest-interceptor', type: 'implements', label: '', stages: [7] },
    { from: 'interceptor-class-serializer', to: 'iface-nest-interceptor', type: 'implements', label: '', stages: [7] },
    { from: 'HttpExceptionFilter', to: 'iface-exception-filter', type: 'implements', label: '', stages: [7] },
    { from: 'ExternalContextCreator', to: 'ContextCreator', type: 'uses', label: '复用收集规则', stages: [7] },
    { from: 'ExternalContextCreator', to: 'GuardsConsumer', type: 'calls', label: 'WS/RPC 同构管道', stages: [7] },
    { from: 'use-enhancers-decorators', to: 'GuardsContextCreator', type: 'annotates', label: '元数据被三级合并', stages: [7] },

    /* ---- Stage 8 · 钩子 / 测试 / 生态 ---- */
    { from: 'NestApplicationContext', to: 'hooks-functions', type: 'calls', label: '按距离触发', stages: [8] },
    { from: 'hooks-functions', to: 'lifecycle-hooks', type: 'calls', label: '逐实例调用', stages: [8] },
    { from: 'NestApplicationContext', to: 'TopologyTree', type: 'uses', label: 'walk 分层', stages: [8] },
    { from: 'Test', to: 'TestingModuleBuilder', type: 'creates', label: 'createTestingModule', stages: [8] },
    { from: 'TestingModuleBuilder', to: 'TestingModule', type: 'creates', label: 'compile()', stages: [8] },
    { from: 'TestingModule', to: 'NestApplicationContext', type: 'extends', label: '', stages: [8] },
    { from: 'TestingInjector', to: 'TestingModuleBuilder', type: 'feeds', label: '消费 override 表', stages: [8] },
    { from: 'SocketModule', to: 'WebSocketsController', type: 'creates', label: '扫描网关', stages: [8] },
    { from: 'NestMicroservice', to: 'NestApplicationContext', type: 'extends', label: '', stages: [8] },
    { from: 'MicroservicesModule', to: 'NestMicroservice', type: 'uses', label: 'setupListeners', stages: [8] },
    { from: 'MicroservicesModule', to: 'ClientProxy', type: 'provides', label: 'setupClients 注入', stages: [8] },
    { from: 'MicroservicesModule', to: 'Server', type: 'calls', label: '绑定 handler', stages: [8] },
  ],

  stages: [
    {
      id: 0, title: '总览：包与依赖', short: '总览',
      question: '仓库里这 8 个包各自是什么、谁依赖谁？cats-app 又站在哪里？',
      narrative: 'monorepo 的 packages/ 下共有 8 个包：@nestjs/common 是"用户面"（装饰器/契约/内置实现），@nestjs/core 是"运行时"（扫描/DI/路由/增强器），platform-* 提供可替换的 HTTP/WS 平台，testing/ws/microservices 是外围工具。依赖方向永远是 platform→core→common，业务应用（sample/01-cats-app）只面对三者。点击包节点可查看各包的设计定位。',
      catsAppHint: 'sample/01-cats-app 实际依赖 core/common/express 三个包，spec 测试用到 @nestjs/testing —— 这就是你 clone 下来的仓库结构。',
      lanes: ['业务应用', '基础包', '核心包', '平台与生态'],
      nodes: ['pkg-catsapp', 'pkg-common', 'pkg-core', 'pkg-express', 'pkg-websockets', 'pkg-microservices', 'pkg-testing'],
      pos: {
        'pkg-catsapp': { col: 1, row: 1 }, 'pkg-common': { col: 2, row: 1 },
        'pkg-core': { col: 3, row: 1 }, 'pkg-express': { col: 4, row: 1 },
        'pkg-websockets': { col: 4, row: 2 }, 'pkg-microservices': { col: 4, row: 3 },
        'pkg-testing': { col: 4, row: 4 },
      },
    },
    {
      id: 1, title: '编译期：装饰器与元数据', short: '① 装饰器',
      question: '@Module / @Controller / @Injectable 到底往类上写了什么？',
      narrative: 'TypeScript 编译后，所有装饰器都只是把元数据写进类（Reflect.defineMetadata）——没有任何逻辑执行。@Module 写入四元组，@Controller/@Injectable 写入"水印+路径"，HTTP 方法与参数装饰器写入路由与取参声明，@Roles 这类自定义装饰器经 SetMetadata/createDecorator 写入任意键值。框架要到 Stage 3 才会来读这些数据：装饰器（写入方）与扫描器（读取方）之间只靠常量表里的一组 key 契约衔接。',
      catsAppHint: '对应 src/ 下 app.module.ts、cats/*.ts、core/core.module.ts：它们此刻只是"贴满标签的类"，什么都没发生。',
      lanes: ['业务代码 (src/)', '装饰器 (@nestjs/common)', '元数据层 (Reflect)'],
      nodes: ['cats-main', 'AppModule', 'CatsModule', 'CoreModule', 'CatsController', 'CatsService', 'RolesGuard',
        'dec-module', 'dec-global', 'dec-injectable', 'dec-controller', 'dec-catch', 'use-enhancers-decorators',
        'dec-setmetadata', 'dec-inject-optional', 'http-method-decorators', 'route-params-decorators', 'response-decorators', 'common-constants'],
      pos: {
        'cats-main': { col: 1, row: 1 }, 'AppModule': { col: 1, row: 2 }, 'CatsModule': { col: 1, row: 3 },
        'CoreModule': { col: 1, row: 4 }, 'CatsController': { col: 1, row: 5 }, 'CatsService': { col: 1, row: 6 },
        'RolesGuard': { col: 1, row: 7 },
        'dec-module': { col: 2, row: 1 }, 'dec-global': { col: 2, row: 2 }, 'dec-injectable': { col: 2, row: 3 },
        'dec-controller': { col: 2, row: 4 }, 'dec-catch': { col: 2, row: 5 }, 'use-enhancers-decorators': { col: 2, row: 6 },
        'dec-setmetadata': { col: 2, row: 7 }, 'dec-inject-optional': { col: 2, row: 8 },
        'http-method-decorators': { col: 2, row: 9 }, 'route-params-decorators': { col: 2, row: 10 },
        'response-decorators': { col: 2, row: 11 },
        'common-constants': { col: 3, row: 6 },
      },
    },
    {
      id: 2, title: '引导启动', short: '② 引导',
      question: 'NestFactory.create(AppModule) 这一行背后发生了什么？',
      narrative: 'main.ts 的一行 create() 是全部装配的起点：先懒加载平台适配器（默认 ExpressAdapter），再依次创建 ApplicationConfig（全局配置仓库）与 NestContainer（IoC 账本），用 DependenciesScanner 把模块树扫进容器（Stage 3 详解），用 InstanceLoader 实例化全部依赖（Stage 4 详解），最后 new NestApplication 返回。全程包在 ExceptionsZone 里——启动失败即报错退出。返回的 app 调 useGlobalPipes 只是"登记"，listen 才触发 init()：注册中间件→注册路由→钩子→监听端口。',
      catsAppHint: 'main.ts：const app = await NestFactory.create(AppModule) → app.useGlobalPipes(new ValidationPipe()) → await app.listen(3000)。',
      lanes: ['main.ts', '工厂与应用', '容器·扫描·加载', 'init 链：中间件·路由', '平台适配', '异常隔离'],
      nodes: ['cats-main', 'NestFactoryStatic', 'ApplicationConfig', 'NestApplicationContext', 'NestApplication',
        'NestContainer', 'DependenciesScanner', 'InstanceLoader', 'MiddlewareModule', 'RoutesResolver',
        'AbstractHttpAdapter', 'ExpressAdapter', 'InternalProvidersStorage', 'ExceptionsZone', 'ExceptionHandler'],
      pos: {
        'cats-main': { col: 1, row: 1 },
        'NestFactoryStatic': { col: 2, row: 1 }, 'ApplicationConfig': { col: 2, row: 2 },
        'NestApplicationContext': { col: 2, row: 3 }, 'NestApplication': { col: 2, row: 4 },
        'NestContainer': { col: 3, row: 1 }, 'DependenciesScanner': { col: 3, row: 2 }, 'InstanceLoader': { col: 3, row: 3 },
        'MiddlewareModule': { col: 4, row: 2 }, 'RoutesResolver': { col: 4, row: 3 },
        'AbstractHttpAdapter': { col: 5, row: 1 }, 'ExpressAdapter': { col: 5, row: 2 }, 'InternalProvidersStorage': { col: 5, row: 3 },
        'ExceptionsZone': { col: 6, row: 1 }, 'ExceptionHandler': { col: 6, row: 2 },
      },
    },
    {
      id: 3, title: '扫描与模块容器', short: '③ 扫描',
      question: '模块树如何被发现，又如何变成可管理的数据结构？',
      narrative: 'DependenciesScanner.scan() 先注册框架自己的 InternalCoreModule（Reflector/ModuleRef 等 provider 要先可用），再从 AppModule 递归：每个 import 经 ModuleCompiler 编译成 {type, token, dynamicMetadata}（token 策略可选 ByReference 或 DeepHashed），NestContainer 为其创建 Module 实例，providers/controllers 全部包装成 InstanceWrapper 记账。同时用 TopologyTree 计算模块"距离"（钩子次序依据），收集 APP_* 全局增强器写入 ApplicationConfig。至此，一棵"贴标签的类树"变成了"带账本的对象树"。',
      catsAppHint: 'AppModule 的 imports: [CoreModule, CatsModule] 在这里被展开；CoreModule 的两个 APP_INTERCEPTOR 被收进全局配置。',
      lanes: ['业务模块', '扫描器', '编译与 token', '容器', '模块结构', '内部核心/工具'],
      nodes: ['AppModule', 'CatsModule', 'CoreModule', 'DependenciesScanner', 'MetadataScanner', 'ModuleCompiler',
        'ByReferenceModuleOpaqueKeyFactory', 'DeepHashedModuleOpaqueKeyFactory', 'NestContainer', 'ModulesContainer',
        'Module', 'InstanceWrapper', 'InternalCoreModule', 'TopologyTree', 'Reflector'],
      pos: {
        'AppModule': { col: 1, row: 1 }, 'CatsModule': { col: 1, row: 2 }, 'CoreModule': { col: 1, row: 3 },
        'DependenciesScanner': { col: 2, row: 1 }, 'MetadataScanner': { col: 2, row: 2 },
        'ModuleCompiler': { col: 3, row: 1 }, 'ByReferenceModuleOpaqueKeyFactory': { col: 3, row: 2 },
        'DeepHashedModuleOpaqueKeyFactory': { col: 3, row: 3 },
        'NestContainer': { col: 4, row: 1 }, 'ModulesContainer': { col: 4, row: 2 },
        'Module': { col: 5, row: 1 }, 'InstanceWrapper': { col: 5, row: 2 },
        'InternalCoreModule': { col: 6, row: 1 }, 'TopologyTree': { col: 6, row: 2 }, 'Reflector': { col: 6, row: 3 },
      },
    },
    {
      id: 4, title: '依赖注入与实例化', short: '④ 注入',
      question: 'CatsService 是怎么被 new 出来并注入 CatsController 的？',
      narrative: 'InstanceLoader 两阶段启动：先给所有 wrapper 铺"原型壳"（前向引用安全），再按 providers→injectables→controllers 的次序并行实例化。真正的 new 发生在 Injector：它反射构造参数类型（@Inject/@Optional 可覆盖），递归解析每个依赖，处理 REQUEST/TRANSIENT 作用域，循环依赖靠 SettlementSignal 的 pending Promise 化解。实例写进 InstanceWrapper 的 ContextId 缓存；ModuleRef/InstanceLinksHost 则是启动后用户手动取实例的两条通道。',
      catsAppHint: 'CatsService 先实例化，CatsController 后实例化并完成构造注入 —— main.ts 能跑起来全靠这条链。',
      lanes: ['两阶段加载', '注入器与信号', '索引与查找', '运行时 API', '业务实例'],
      nodes: ['InstanceLoader', 'Module', 'InstanceWrapper', 'Injector', 'SettlementSignal', 'InstanceLinksHost',
        'ModuleRef', 'AbstractInstanceResolver', 'LazyModuleLoader', 'CatsService', 'CatsController'],
      pos: {
        'InstanceLoader': { col: 1, row: 1 }, 'Module': { col: 1, row: 2 }, 'InstanceWrapper': { col: 1, row: 3 },
        'Injector': { col: 2, row: 1 }, 'SettlementSignal': { col: 2, row: 2 },
        'InstanceLinksHost': { col: 3, row: 1 },
        'ModuleRef': { col: 4, row: 1 }, 'AbstractInstanceResolver': { col: 4, row: 2 }, 'LazyModuleLoader': { col: 4, row: 3 },
        'CatsService': { col: 5, row: 1 }, 'CatsController': { col: 5, row: 2 },
      },
    },
    {
      id: 5, title: '中间件与路由注册', short: '⑤ 路由',
      question: 'configure(consumer) 和 @Get(":id") 何时被翻译成 Express 路由？',
      narrative: 'NestApplication.init() 的两步注册。中间件线：MiddlewareModule 调用各模块的 configure(consumer)，MiddlewareBuilder 把 apply(...).forRoutes(...) 翻译成配置，RoutesMapper 把控制器类展开成路由信息，RouteInfoPathExtractor 换算成真实路径后经 RouterProxy 挂到适配器。路由线：RoutesResolver 遍历全部控制器交给 RouterExplorer —— PathsExplorer 扫方法、RouterExecutionContext 编译请求管道（Stage 6 的主角）、RoutePathFactory 拼最终路径、RouterMethodFactory 映射成 adapter.get/post，最终 app.get("/cats/:id", proxy) 挂载完成。启动日志里的 Mapped {...} 就是这条链的副产品。',
      catsAppHint: '若在 AppModule 里 configure(consumer) { consumer.apply(LoggerMiddleware).forRoutes("cats") }，中间件线即为它服务。',
      lanes: ['业务侧', '中间件子系统', '路由探索', '代理与挂载'],
      nodes: ['AppModule', 'CatsController', 'LoggerMiddleware', 'MiddlewareModule', 'MiddlewareContainer', 'MiddlewareBuilder',
        'MiddlewareResolver', 'RoutesMapper', 'RouteInfoPathExtractor', 'RoutesResolver', 'RouterExplorer', 'PathsExplorer',
        'RoutePathFactory', 'RouterProxy', 'RouterExceptionFilters', 'RouterMethodFactory', 'ExpressAdapter'],
      pos: {
        'AppModule': { col: 1, row: 1 }, 'CatsController': { col: 1, row: 2 }, 'LoggerMiddleware': { col: 1, row: 3 },
        'MiddlewareModule': { col: 2, row: 1 }, 'MiddlewareContainer': { col: 2, row: 2 }, 'MiddlewareBuilder': { col: 2, row: 3 },
        'MiddlewareResolver': { col: 2, row: 4 }, 'RoutesMapper': { col: 2, row: 5 }, 'RouteInfoPathExtractor': { col: 2, row: 6 },
        'RoutesResolver': { col: 3, row: 1 }, 'RouterExplorer': { col: 3, row: 2 }, 'PathsExplorer': { col: 3, row: 3 },
        'RoutePathFactory': { col: 3, row: 4 },
        'RouterProxy': { col: 4, row: 1 }, 'RouterExceptionFilters': { col: 4, row: 2 },
        'RouterMethodFactory': { col: 4, row: 3 }, 'ExpressAdapter': { col: 4, row: 4 },
      },
    },
    {
      id: 6, title: '请求生命周期', short: '⑥ 请求',
      question: '一条 GET /cats/1 请求依次经过哪些框架类？（可点 ▶ 播放）',
      narrative: '启动期编译好的管道此刻运行：Express 收到请求 →（若配置）LoggerMiddleware → RouterProxy 进入路由闭包 → RouterExecutionContext 依次执行：①GuardsConsumer 跑守卫链（RolesGuard 经 Reflector 读 @Roles）→ ②InterceptorsConsumer 组装 RxJS 洋葱（Transform/Logging 的前置段）→ ③RouteParamsFactory 提取参数 → ④PipesConsumer 应用管道（ParseIntPipe 把 "1" 转成 1）→ ⑤CatsController.findOne 执行 → 拦截器后置段（map 包裹 {data}）→ ⑥RouterResponseController 写出。任何一环抛异常都汇入 ExceptionsHandler → @Catch 过滤器链 → BaseExceptionFilter 兜底。',
      catsAppHint: 'GET /cats/1 的完整旅程：日志 → RolesGuard（POST /cats 才有角色限制）→ 拦截器 → ParseIntPipe → findOne → {data} 响应。',
      lanes: ['① 进入', '② 代理·管道', '③ Guard', '④ Interceptor', '⑤ 参数·Pipe', '⑥ Handler', '⑦ 响应·异常'],
      nodes: ['ExpressAdapter', 'LoggerMiddleware', 'RouterProxy', 'RouterExecutionContext', 'RolesGuard', 'GuardsConsumer',
        'Reflector', 'iface-arguments-host', 'InterceptorsConsumer', 'TransformInterceptor', 'LoggingInterceptor',
        'RouteParamsFactory', 'PipesConsumer', 'ParamsTokenFactory', 'cats-parse-int-pipe', 'route-params-decorators',
        'CatsController', 'RouterResponseController', 'SseStream', 'ExceptionsHandler', 'HttpExceptionFilter',
        'BaseExceptionFilter', 'exception-http'],
      pos: {
        'ExpressAdapter': { col: 1, row: 1 }, 'LoggerMiddleware': { col: 1, row: 2 },
        'RouterProxy': { col: 2, row: 1 }, 'RouterExecutionContext': { col: 2, row: 2 },
        'RolesGuard': { col: 3, row: 1 }, 'GuardsConsumer': { col: 3, row: 2 }, 'Reflector': { col: 3, row: 3 },
        'iface-arguments-host': { col: 3, row: 4 },
        'InterceptorsConsumer': { col: 4, row: 1 }, 'TransformInterceptor': { col: 4, row: 2 }, 'LoggingInterceptor': { col: 4, row: 3 },
        'RouteParamsFactory': { col: 5, row: 1 }, 'PipesConsumer': { col: 5, row: 2 }, 'ParamsTokenFactory': { col: 5, row: 3 },
        'cats-parse-int-pipe': { col: 5, row: 4 }, 'route-params-decorators': { col: 5, row: 5 },
        'CatsController': { col: 6, row: 1 },
        'RouterResponseController': { col: 7, row: 1 }, 'SseStream': { col: 7, row: 2 }, 'ExceptionsHandler': { col: 7, row: 3 },
        'HttpExceptionFilter': { col: 7, row: 4 }, 'BaseExceptionFilter': { col: 7, row: 5 }, 'exception-http': { col: 7, row: 6 },
      },
      play: {
        seq: ['ExpressAdapter', 'LoggerMiddleware', 'RouterProxy', 'RouterExecutionContext', 'GuardsConsumer',
          'RolesGuard', 'InterceptorsConsumer', 'TransformInterceptor', 'PipesConsumer', 'cats-parse-int-pipe',
          'CatsController', 'RouterResponseController', 'ExpressAdapter'],
        note: 'GET /cats/1 完成：中间件 → 守卫 → 拦截器 → 管道 → handler → 响应包裹 {data}',
      },
    },
    {
      id: 7, title: '增强器四件套与异常处理', short: '⑦ 增强器',
      question: 'Guard / Pipe / Interceptor / Filter 为什么长得一模一样？',
      narrative: '因为它们共享同一个收集模式：ContextCreator 模板方法做"全局→控制器→方法"三级合并，四个 XxxContextCreator 子类只负责实例化；执行侧各有 XxxConsumer。四种全局注册路径（app.useGlobalXxx、APP_* token、类/方法 @UseXxx、参数内联管道）最终都汇入同一套合并逻辑——这就是"同构"的实现根源。契约侧四个接口（CanActivate/PipeTransform/NestInterceptor/ExceptionFilter）全部是接口而非基类，ExternalContextCreator 还把同一套管道复用到 WS/RPC——增强器与传输、与注册方式全部解耦。',
      catsAppHint: 'RolesGuard(@UseGuards) / ParseIntPipe(参数级) / ValidationPipe(main.ts 全局) / APP_INTERCEPTOR(CoreModule 配置式) —— 四种注册方式在此汇流。',
      lanes: ['全局配置与契约', '上下文创建 (收集)', '消费者 (执行)', '内置实现 (common)', '业务实现 / 绑定'],
      nodes: ['ApplicationConfig', 'iface-can-activate', 'iface-pipe-transform', 'iface-nest-interceptor', 'iface-exception-filter',
        'ContextCreator', 'GuardsContextCreator', 'PipesContextCreator', 'InterceptorsContextCreator', 'BaseExceptionFilterContext',
        'ExternalContextCreator', 'GuardsConsumer', 'PipesConsumer', 'ParamsTokenFactory', 'InterceptorsConsumer',
        'pipe-validation', 'builtin-parse-pipes', 'interceptor-class-serializer', 'logger-console',
        'RolesGuard', 'cats-parse-int-pipe', 'HttpExceptionFilter', 'TransformInterceptor', 'use-enhancers-decorators'],
      pos: {
        'ApplicationConfig': { col: 1, row: 1 }, 'iface-can-activate': { col: 1, row: 2 }, 'iface-pipe-transform': { col: 1, row: 3 },
        'iface-nest-interceptor': { col: 1, row: 4 }, 'iface-exception-filter': { col: 1, row: 5 },
        'ContextCreator': { col: 2, row: 1 }, 'GuardsContextCreator': { col: 2, row: 2 }, 'PipesContextCreator': { col: 2, row: 3 },
        'InterceptorsContextCreator': { col: 2, row: 4 }, 'BaseExceptionFilterContext': { col: 2, row: 5 },
        'ExternalContextCreator': { col: 2, row: 6 },
        'GuardsConsumer': { col: 3, row: 1 }, 'PipesConsumer': { col: 3, row: 2 }, 'ParamsTokenFactory': { col: 3, row: 3 },
        'InterceptorsConsumer': { col: 3, row: 4 },
        'pipe-validation': { col: 4, row: 1 }, 'builtin-parse-pipes': { col: 4, row: 2 },
        'interceptor-class-serializer': { col: 4, row: 3 }, 'logger-console': { col: 4, row: 4 },
        'RolesGuard': { col: 5, row: 1 }, 'cats-parse-int-pipe': { col: 5, row: 2 }, 'HttpExceptionFilter': { col: 5, row: 3 },
        'TransformInterceptor': { col: 5, row: 4 }, 'use-enhancers-decorators': { col: 5, row: 5 },
      },
    },
    {
      id: 8, title: '生命周期钩子 · 测试 · 生态（简览）', short: '⑧ 钩子·生态',
      question: '应用怎么优雅启停？测试和 WS/微服务子系统如何接入同一套容器？',
      narrative: '钩子线：五个生命周期接口（OnModuleInit…）由 core 的 hooks/* 函数按 TopologyTree 距离分层触发——确定性初始化次序。测试线：Test.createTestingModule → Builder 收集 override 声明 → compile 出 TestingModule（继承应用上下文），TestingInjector 以"薄拦截"方式替换 provider——生产 DI 原样复用。生态线：SocketModule / MicroservicesModule 都是 NestApplication.init 拉起的可选子系统，处理管道经 ExternalContextCreator 与 HTTP 同构。这部分为简览，后续可按需扩充。',
      catsAppHint: 'cats.controller.spec.ts / cats.service.spec.ts 的 Test.createTestingModule({...}) 即来自 @nestjs/testing。',
      lanes: ['生命周期钩子', '@nestjs/testing', '@nestjs/websockets', '@nestjs/microservices'],
      nodes: ['lifecycle-hooks', 'hooks-functions', 'NestApplicationContext', 'TopologyTree',
        'Test', 'TestingModuleBuilder', 'TestingModule', 'TestingInjector',
        'SocketModule', 'WebSocketsController', 'NestMicroservice', 'MicroservicesModule', 'ClientProxy', 'Server'],
      pos: {
        'lifecycle-hooks': { col: 1, row: 1 }, 'hooks-functions': { col: 1, row: 2 },
        'NestApplicationContext': { col: 1, row: 3 }, 'TopologyTree': { col: 1, row: 4 },
        'Test': { col: 2, row: 1 }, 'TestingModuleBuilder': { col: 2, row: 2 },
        'TestingModule': { col: 2, row: 3 }, 'TestingInjector': { col: 2, row: 4 },
        'SocketModule': { col: 3, row: 1 }, 'WebSocketsController': { col: 3, row: 2 },
        'NestMicroservice': { col: 4, row: 1 }, 'MicroservicesModule': { col: 4, row: 2 },
        'ClientProxy': { col: 4, row: 3 }, 'Server': { col: 4, row: 4 },
      },
    },
  ],

  /* =========================================================================
   * v2 · 跟读旅程：lead=本步主角（呼吸高亮）；cast=本步登场的其他类；
   * edges=[from,to]=本步点亮的协作边（须已存在于上方 edges）；play=true 显示连播按钮
   * ========================================================================= */
  journeys: [
    {
      id: 'bootstrap', title: '启动旅程', subtitle: 'main.ts 的 3 行代码背后',
      steps: [
        {
          no: 1, nav: '① main.ts', title: '起点：main.ts',
          lead: 'cats-main', cast: [], edges: [],
          text: [
            '一切从这 3 行开始：NestFactory.create(AppModule) 完成全部装配，useGlobalPipes 登记全局校验管道，listen(3000) 拉起 HTTP 服务。',
            '业务代码只写"声明"，装配细节全部沉入框架——接下来 15 步，就是这行 create() 背后的真实故事。',
          ],
          snippet: { path: 'sample/01-cats-app/src/main.ts', code: 'async function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  app.useGlobalPipes(new ValidationPipe());\n  await app.listen(3000);\n}\nbootstrap();' },
          catsApp: '这就是 sample/01-cats-app/src/main.ts 的全部有效代码。',
          path: 'sample/01-cats-app/src/main.ts',
        },
        {
          no: 2, nav: '② create()', title: 'NestFactoryStatic.create()：唯一入口',
          lead: 'NestFactoryStatic', cast: [], edges: [['cats-main', 'NestFactoryStatic']],
          text: [
            'create() 内部次序是固定的：创建 ApplicationConfig 与 NestContainer → 构造 DependenciesScanner 扫描模块树 → InstanceLoader 实例化全部依赖 → new NestApplication 返回。',
            '类导出为单例 NestFactory——本旅程后面出现的每个组件，都是它在这里装配出来的。',
          ],
          snippet: { path: 'packages/core/nest-factory.ts（主流程示意）', code: 'const applicationConfig = new ApplicationConfig();\nconst container = new NestContainer();\nawait ExceptionsZone.asyncRun(async () => {\n  scanner.scan(module);                                 // ⑨ 步\n  await instanceLoader.createInstancesOfDependencies(); // ⑫⑬ 步\n});\nreturn new NestApplication(container, httpAdapter, config);' },
          catsApp: 'main.ts 第 6 行：const app = await NestFactory.create(AppModule)。',
          path: 'packages/core/nest-factory.ts',
        },
        {
          no: 3, nav: '③ 保护圈', title: 'ExceptionsZone：启动保护圈',
          lead: 'ExceptionsZone', cast: [], edges: [['NestFactoryStatic', 'ExceptionsZone']],
          text: [
            '整个启动过程包在 ExceptionsZone.asyncRun() 里：任何装配阶段的异常都会被 ExceptionHandler 记录，然后终止进程——不给"半启动"的僵尸应用留机会。',
            '你看到的启动报错红字，就来自这条兜底链路。',
          ],
          catsApp: '如果把 AppModule 的某个 import 写错，终端里的报错与退出就是它的输出。',
          path: 'packages/core/errors/exceptions-zone.ts',
        },
        {
          no: 4, nav: '④ 适配器', title: 'ExpressAdapter：懒加载的平台适配器',
          lead: 'ExpressAdapter', cast: ['AbstractHttpAdapter'], edges: [['NestFactoryStatic', 'AbstractHttpAdapter'], ['ExpressAdapter', 'AbstractHttpAdapter']],
          text: [
            '@nestjs/core 根本不认识 Express！适配器是运行时 require("@nestjs/platform-express") 懒加载进来的（loadAdapter）。',
            'AbstractHttpAdapter 定义抽象桥（路由转发直接实现、reply/render/解析器等声明为抽象），ExpressAdapter 补齐平台细节——同一套业务代码可切换 Express/Fastify 的根基就在这。',
          ],
          catsApp: 'main.ts 没有指定适配器 → 默认懒加载的就是它；app.listen(3000) 最终是它的 listen。',
          path: 'packages/platform-express/adapters/express-adapter.ts',
        },
        {
          no: 5, nav: '⑤ 配置仓库', title: 'ApplicationConfig：全局配置仓库',
          lead: 'ApplicationConfig', cast: [], edges: [['NestFactoryStatic', 'ApplicationConfig']],
          text: [
            '纯状态仓库：globalPipes / globalGuards / globalInterceptors / globalFilters 四个列表，加上全局前缀与版本化策略。',
            'main.ts 的 app.useGlobalPipes(new ValidationPipe()) 就是往这里登记——注意只是登记，真正生效要等到每条路由组装管道的时候。',
          ],
          catsApp: 'main.ts 第 7 行 useGlobalPipes 的去向；core.module.ts 的 APP_INTERCEPTOR 稍后也会汇入这里的 globalInterceptors。',
          path: 'packages/core/application-config.ts',
        },
        {
          no: 6, nav: '⑥ IoC 账本', title: 'NestContainer：IoC 总账本',
          lead: 'NestContainer', cast: [], edges: [['NestFactoryStatic', 'NestContainer']],
          text: [
            '依赖注入的中枢创建：内部持有 ModulesContainer（token→Module 的 Map）、全局模块集合和 ModuleCompiler。',
            '此后框架"两段式"干活：扫描阶段先记账（接下来 3 步），实例化阶段再照账本 new（第 12-13 步）——这是贯穿整个启动过程的核心模式。',
          ],
          catsApp: 'AppModule / CatsModule / CoreModule 以及框架自己的内部模块，最终都作为条目存在这里。',
          path: 'packages/core/injector/container.ts',
        },
        {
          no: 7, nav: '⑦ 内部模块', title: 'InternalCoreModule：框架先服务自己',
          lead: 'InternalCoreModule', cast: [], edges: [],
          text: [
            '扫描开始前，框架先注册自己的内部全局模块：Reflector、ModuleRef、REQUEST、INQUIRER 等 provider 要先就位，后面的扫描与注入才能"用自己的 DI 服务自己"。',
            '所以你在任何 provider 里都能直接注入 Reflector——不是魔法，是它先注册了。',
          ],
          catsApp: 'RolesGuard 里注入的 Reflector，就是这一步提供的。',
          path: 'packages/core/injector/internal-core-module/internal-core-module.ts',
        },
        {
          no: 8, nav: '⑧ 装饰器回看', title: '回看编译期：装饰器早已写好数据',
          lead: 'dec-module', cast: ['dec-controller', 'dec-injectable', 'common-constants', 'AppModule', 'CatsModule', 'CoreModule'],
          edges: [['AppModule', 'dec-module'], ['CatsModule', 'dec-module'], ['CoreModule', 'dec-module'], ['dec-module', 'common-constants'], ['dec-controller', 'common-constants'], ['dec-injectable', 'common-constants']],
          text: [
            '回看你的业务模块：@Module 把 {imports, controllers, providers, exports} 写进 AppModule 的元数据；@Controller("cats")、@Injectable 也各自写好水印与路径。',
            '装饰器只写数据、不含逻辑——下一行的 scanner 就是来"读账"的。装饰器与框架之间，只有常量表里那组 key 的契约。',
          ],
          snippet: { path: 'packages/common/decorators/modules/module.decorator.ts（概念）', code: '@Module({ imports: [CoreModule, CatsModule] })\nexport class AppModule {}\n// 编译后等价于：\n// Reflect.defineMetadata(MODULE_METADATA, { imports: [...] }, AppModule)' },
          catsApp: 'app.module.ts / cats.module.ts / core.module.ts 三个文件的 @Module 元数据。',
          path: 'packages/common/decorators/modules/module.decorator.ts',
        },
        {
          no: 9, nav: '⑨ 扫描', title: 'DependenciesScanner：递归扫描模块树',
          lead: 'DependenciesScanner', cast: [],
          edges: [['DependenciesScanner', 'InternalCoreModule'], ['DependenciesScanner', 'AppModule'], ['AppModule', 'CatsModule'], ['AppModule', 'CoreModule'], ['DependenciesScanner', 'NestContainer']],
          text: [
            'scan() 从 AppModule 递归 scanModulesForDependencies：读 @Module 元数据 → imports 逐个展开（AppModule→CoreModule、CatsModule）→ providers/controllers 登记进对应模块。',
            '顺带两件大事：用 TopologyTree 计算模块"距离"（决定钩子次序）；发现 APP_INTERCEPTOR 这类 provider 时，收进 ApplicationConfig 做全局增强器。',
          ],
          snippet: { path: 'packages/core/scanner.ts', code: 'scan(module) {\n  this.registerInternalCoreModule();        // ⑦ 步的模块最先注册\n  this.scanModulesForDependencies(module);  // 递归 imports\n  this.calculateModulesDistance(container); // 钩子次序依据\n  this.bindGlobalScope();\n}' },
          catsApp: 'AppModule 的 imports: [CoreModule, CatsModule] 在这里被展开成模块树；CoreModule 的两个 APP_INTERCEPTOR 也是在这里被收走的。',
          path: 'packages/core/scanner.ts',
        },
        {
          no: 10, nav: '⑩ 编译 token', title: 'ModuleCompiler：每个 import 编译出唯一 token',
          lead: 'ModuleCompiler', cast: ['ByReferenceModuleOpaqueKeyFactory'],
          edges: [['DependenciesScanner', 'ModuleCompiler'], ['ModuleCompiler', 'ByReferenceModuleOpaqueKeyFactory']],
          text: [
            '每个 import 都要编译：普通类直接取、DynamicModule 展开缓存、forwardRef 解包，产出统一的 {type, token, dynamicMetadata}。',
            'token 生成是策略化的：默认 ByReference 把 id 缓存在对象引用上（快）；deep-hash 模式按内容 sha256——内容相同的动态模块自动去重为单例。',
          ],
          catsApp: '若把 CoreModule 改写成 CoreModule.forRoot() 风格并多处导入，两种 token 策略的差异就会显现。',
          path: 'packages/core/injector/compiler.ts',
        },
        {
          no: 11, nav: '⑪ 记账', title: 'Module + InstanceWrapper：容器里的账本形态',
          lead: 'Module', cast: ['InstanceWrapper'],
          edges: [['NestContainer', 'Module'], ['Module', 'InstanceWrapper']],
          text: [
            'CatsModule 在容器里的形态：一个 Module 实例，providers / controllers 全部包成 InstanceWrapper（token、scope、按 ContextId 缓存的实例）。',
            '构造时自动追加本模块的 ModuleRef 与全局 ApplicationConfig——所以任何 provider 里都能直接注入它们，不需要额外注册。',
          ],
          catsApp: 'CatsModule 的 providers 里有 CatsService 的 wrapper、controllers 里有 CatsController 的 wrapper。',
          path: 'packages/core/injector/module.ts',
        },
        {
          no: 12, nav: '⑫ 两阶段', title: 'InstanceLoader：先铺原型壳，再并行实例化',
          lead: 'InstanceLoader', cast: [],
          edges: [['NestFactoryStatic', 'InstanceLoader'], ['InstanceLoader', 'Module']],
          text: [
            '两阶段加载：第一阶段给所有 wrapper 铺"原型壳"（保证前向引用安全），第二阶段按 providers→injectables→controllers 的次序并行实例化。',
            '为什么 providers 先于 controllers？控制器依赖服务——固定次序让"被依赖者优先就绪"天然成立。',
          ],
          catsApp: 'CatsService 先于 CatsController 实例化，注入时依赖已就绪。',
          path: 'packages/core/injector/instance-loader.ts',
        },
        {
          no: 13, nav: '⑬ 注入', title: 'Injector：CatsService 注入 CatsController',
          lead: 'Injector', cast: ['CatsService', 'CatsController'],
          edges: [['InstanceLoader', 'Injector'], ['Injector', 'CatsService'], ['Injector', 'CatsController'], ['CatsService', 'CatsController']],
          text: [
            '真正 new 类的地方：反射构造参数类型，递归解析每个依赖，处理 @Inject / @Optional 与作用域；循环依赖靠 SettlementSignal 的 pending Promise 化解。',
            'private readonly catsService: CatsService 这行构造注入，就是在这里完成取货的。',
          ],
          snippet: { path: 'packages/core/injector/injector.ts（概念）', code: 'resolveConstructorParams(metatype, targets, callback) {\n  for (const [index, param] of params.entries()) {\n    const instance = await this.resolveComponentInstance(...);\n    callback(index, instance);   // CatsService 的单例填入实参\n  }\n}' },
          catsApp: 'cats.controller.ts 的 constructor(private readonly catsService: CatsService)。',
          path: 'packages/core/injector/injector.ts',
        },
        {
          no: 14, nav: '⑭ 应用就绪', title: 'NestApplication：create() 返回了',
          lead: 'NestApplication', cast: [],
          edges: [['NestFactoryStatic', 'NestApplication'], ['NestApplication', 'ApplicationConfig']],
          text: [
            '装配完成，create() 返回 NestApplication（实现 INestApplication）——main.ts 里所有 app.* 调用的接收者都是它。',
            '此刻的 app.useGlobalPipes() 只是登记；它自己几乎不干活，职责是编排：每件事转交给正确的子系统。',
          ],
          catsApp: 'const app = await NestFactory.create(AppModule) 拿到的 app 就是它的实例。',
          path: 'packages/core/nest-application.ts',
        },
        {
          no: 15, nav: '⑮ init()', title: 'init()：中间件与路由注册',
          lead: 'NestApplication', cast: ['MiddlewareModule', 'RoutesResolver'],
          edges: [['NestApplication', 'MiddlewareModule'], ['NestApplication', 'RoutesResolver'], ['RoutesResolver', 'ExpressAdapter']],
          text: [
            'listen 触发 init()，次序即框架语义：MiddlewareModule.register()（执行各模块的 configure(consumer)）→ RoutesResolver.resolve()（扫描控制器、把 /cats、/cats/:id 挂到 Express）→ 触发 onModuleInit / onApplicationBootstrap 钩子。',
            '启动日志里那几行 Mapped {/cats/:id, GET}，就是 RoutesResolver 这一步打的。',
          ],
          catsApp: 'CatsController 的三个路由在此挂载：POST /cats、GET /cats、GET /cats/:id。',
          path: 'packages/core/nest-application.ts',
        },
        {
          no: 16, nav: '⑯ listen', title: 'listen(3000)：启动完成',
          lead: 'ExpressAdapter', cast: [],
          edges: [['NestApplication', 'ExpressAdapter']],
          text: [
            'ExpressAdapter.listen(3000)：http.createServer(app).listen(3000)。终端打印 "Application is running on: http://localhost:3000/"。',
            '启动旅程结束。框架此刻的状态：容器里实例就绪、Express 上路由挂好——一切只等下一个请求（→ 请求旅程）。',
          ],
          catsApp: 'main.ts 最后一行：await app.listen(3000)。',
          path: 'packages/core/nest-application.ts',
        },
      ],
      layout: {
        'cats-main': { col: 1, row: 1 }, 'AppModule': { col: 1, row: 2 }, 'CatsModule': { col: 1, row: 3 }, 'CoreModule': { col: 1, row: 4 },
        'NestFactoryStatic': { col: 2, row: 1 }, 'ExceptionsZone': { col: 2, row: 2 }, 'ApplicationConfig': { col: 2, row: 3 },
        'AbstractHttpAdapter': { col: 2, row: 4 }, 'ExpressAdapter': { col: 2, row: 5 },
        'NestContainer': { col: 3, row: 1 }, 'InternalCoreModule': { col: 3, row: 2 }, 'DependenciesScanner': { col: 3, row: 3 },
        'ModuleCompiler': { col: 3, row: 4 }, 'ByReferenceModuleOpaqueKeyFactory': { col: 3, row: 5 },
        'dec-module': { col: 4, row: 1 }, 'dec-controller': { col: 4, row: 2 }, 'dec-injectable': { col: 4, row: 3 }, 'common-constants': { col: 4, row: 4 },
        'Module': { col: 5, row: 1 }, 'InstanceWrapper': { col: 5, row: 2 }, 'InstanceLoader': { col: 5, row: 3 },
        'Injector': { col: 5, row: 4 }, 'CatsService': { col: 5, row: 5 },
        'CatsController': { col: 6, row: 1 }, 'NestApplication': { col: 6, row: 2 },
        'MiddlewareModule': { col: 6, row: 3 }, 'RoutesResolver': { col: 6, row: 4 },
      },
    },
    {
      id: 'request', title: '请求旅程', subtitle: 'GET /cats/1 的完整旅程',
      play: {
        seq: ['ExpressAdapter', 'LoggerMiddleware', 'RouterProxy', 'RouterExecutionContext', 'GuardsConsumer', 'RolesGuard', 'InterceptorsConsumer', 'TransformInterceptor', 'PipesConsumer', 'cats-parse-int-pipe', 'CatsController', 'RouterResponseController', 'ExpressAdapter'],
        note: 'GET /cats/1 完成：中间件 → 守卫 → 拦截器 → 管道 → handler → 响应包裹 {data}',
      },
      steps: [
        {
          no: 1, nav: '① 请求到达', title: 'GET /cats/1 到达 Express',
          lead: 'ExpressAdapter', cast: [], edges: [],
          text: [
            '浏览器敲下 GET /cats/1。请求到达的 httpServer，就是启动旅程第 ④ 步懒加载的那个 Express 实例——Nest 没有自己的服务器，全程靠适配器包装。',
            '此刻框架处于"一切已编译好"的状态：容器里实例就绪、每条路由都是一个提前编译好的闭包，等着被调用。',
          ],
          catsApp: '终端里 curl http://localhost:3000/cats/1 的第一站。',
          path: 'packages/platform-express/adapters/express-adapter.ts',
        },
        {
          no: 2, nav: '② 中间件', title: 'LoggerMiddleware：先于路由的预处理',
          lead: 'LoggerMiddleware', cast: [], edges: [['ExpressAdapter', 'LoggerMiddleware']],
          text: [
            '若在 AppModule 的 configure(consumer) 里挂了 LoggerMiddleware.forRoutes("cats")，它先于路由执行：打印 "Request..." 后 next() 放行。',
            '中间件与守卫的分工：中间件做通用预处理（日志/CORS），不感知 Nest 路由元数据；守卫做业务鉴权，能读装饰器元数据。',
          ],
          snippet: { path: 'sample/01-cats-app/src/common/middleware/logger.middleware.ts', code: '@Injectable()\nexport class LoggerMiddleware implements NestMiddleware {\n  use(req: any, res: any, next: () => void) {\n    console.log(`Request...`);\n    next();\n  }\n}' },
          catsApp: 'common/middleware/logger.middleware.ts——在 AppModule 实现 NestModule 后由 MiddlewareModule 挂载。',
          path: 'sample/01-cats-app/src/common/middleware/logger.middleware.ts',
        },
        {
          no: 3, nav: '③ 路由闭包', title: 'RouterProxy：进入编译好的路由闭包',
          lead: 'RouterProxy', cast: ['RouterExecutionContext'],
          edges: [['LoggerMiddleware', 'RouterProxy'], ['RouterProxy', 'RouterExecutionContext']],
          text: [
            'next() 进入 RouterProxy 包装的闭包——启动期 RouterExecutionContext 已把这条路由"编译"成 fn(req, res, next)，此刻只是执行，请求期零反射。',
            '闭包 catch 一切异常：任何一环抛错都会被接住并导向过滤器链（第 ⑬ 步的伏笔）。',
          ],
          snippet: { path: 'packages/core/router/router-execution-context.ts（编译产物示意）', code: 'const proxy = (req, res, next) => {\n  guards(req, res)                                   // ④\n    ? interceptors(pipes(params(req)) → handler(req)) // ⑤~⑨\n        .subscribe(data => reply(res, data));         // ⑩⑪\n    : res.status(403);\n};' },
          catsApp: 'GET /cats/:id 匹配到的就是这个闭包（启动时 Mapped 日志那条路由）。',
          path: 'packages/core/router/router-proxy.ts',
        },
        {
          no: 4, nav: '④ 守卫', title: 'GuardsConsumer → RolesGuard：鉴权',
          lead: 'GuardsConsumer', cast: ['RolesGuard', 'Reflector'],
          edges: [['RouterExecutionContext', 'GuardsConsumer'], ['GuardsConsumer', 'RolesGuard'], ['RolesGuard', 'Reflector']],
          text: [
            '守卫链逐个 tryActivate：RolesGuard 注入 Reflector 读 @Roles 元数据——GET /cats/1 上没有 @Roles，直接放行；POST /cats 的 create 方法才有 @Roles(["admin"])，届时校验 request.user 的角色，不通过即 403。',
            '进入守卫前，参数已被包装成 ExecutionContext——所以守卫里能 switchToHttp().getRequest() 拿到原生请求。',
          ],
          snippet: { path: 'sample/01-cats-app/src/common/guards/roles.guard.ts', code: 'canActivate(context: ExecutionContext): boolean {\n  const roles = this.reflector.get(Roles, context.getHandler());\n  if (!roles) return true;               // GET /cats/1 走这里\n  const user = context.switchToHttp().getRequest().user;\n  return user && user.roles && hasRole(); // POST /cats 才校验\n}' },
          catsApp: '@UseGuards(RolesGuard) 声明在 CatsController 类级；@Roles 由 Reflector.createDecorator 创建。',
          path: 'sample/01-cats-app/src/common/guards/roles.guard.ts',
        },
        {
          no: 5, nav: '⑤ 拦截器·前置', title: 'InterceptorsConsumer：洋葱的前半段',
          lead: 'InterceptorsConsumer', cast: ['LoggingInterceptor'],
          edges: [['RouterExecutionContext', 'InterceptorsConsumer'], ['InterceptorsConsumer', 'LoggingInterceptor']],
          text: [
            '拦截器是 RxJS 洋葱：InterceptorsConsumer 从最后一个拦截器往前包裹，subscribe 才触发整条链。LoggingInterceptor 在 handler 前打印 "Before..."。',
            '它由 CoreModule 用 { provide: APP_INTERCEPTOR, useClass } 注册成全局——启动旅程第 ⑨ 步被 scanner 收进 ApplicationConfig 的那两个。',
          ],
          snippet: { path: 'sample/01-cats-app/src/core/interceptors/logging.interceptor.ts', code: 'intercept(context, next): Observable<any> {\n  console.log(`Before...`);\n  const now = Date.now();\n  return next.handle()\n    .pipe(tap(() => console.log(`After... ${Date.now() - now}ms`)));\n}' },
          catsApp: 'core/interceptors/logging.interceptor.ts——tap 的另一半要等到第 ⑩ 步。',
          path: 'sample/01-cats-app/src/core/interceptors/logging.interceptor.ts',
        },
        {
          no: 6, nav: '⑥ 拦截器·预备', title: 'TransformInterceptor：map 已挂好，只等数据',
          lead: 'TransformInterceptor', cast: [], edges: [['InterceptorsConsumer', 'TransformInterceptor']],
          text: [
            '第二个全局拦截器：next.handle().pipe(map(data => ({ data })))——此刻还没有数据，map 处于待命状态，handler 返回后才执行改写。',
            '这就是"洋葱"的含义：前置逻辑在 handler 前跑，pipe 里的操作符在 handler 后跑，同一个 intercept 方法里写了前后两段。',
          ],
          snippet: { path: 'sample/01-cats-app/src/core/interceptors/transform.interceptor.ts', code: 'intercept(context, next): Observable<Response<T>> {\n  return next.handle().pipe(map(data => ({ data })));\n}' },
          catsApp: 'core/interceptors/transform.interceptor.ts——findAll 返回的 Cat[] 会被包成 { data: [...] }。',
          path: 'sample/01-cats-app/src/core/interceptors/transform.interceptor.ts',
        },
        {
          no: 7, nav: '⑦ 提取参数', title: 'RouteParamsFactory：取出 "1"（还是字符串）',
          lead: 'RouteParamsFactory', cast: [], edges: [['RouterExecutionContext', 'RouteParamsFactory']],
          text: [
            '按 RouteParamtypes 枚举取值：@Param("id") → req.params.id = "1"；@Body() → req.body；@Query() → req.query。',
            '注意此刻的 "1" 还是字符串——类型转换是下一步管道的职责。参数系统三层分工：取值（本步）→ 分类（ParamsTokenFactory）→ 转换（管道）。',
          ],
          catsApp: 'findOne(@Param("id", ...) id) 里的 "1"。',
          path: 'packages/core/router/route-params-factory.ts',
        },
        {
          no: 8, nav: '⑧ 管道转换', title: 'PipesConsumer → ParseIntPipe："1" 变成 1',
          lead: 'PipesConsumer', cast: ['ParamsTokenFactory', 'cats-parse-int-pipe'],
          edges: [['RouterExecutionContext', 'PipesConsumer'], ['PipesConsumer', 'ParamsTokenFactory'], ['PipesConsumer', 'cats-parse-int-pipe']],
          text: [
            'ParamsTokenFactory 先归类目标（param + data:"id"），PipesConsumer 再把值依次过管道：示例自实现的 ParseIntPipe 做 parseInt("1") → 1，失败抛 BadRequestException。',
            'main.ts 登记的全局 ValidationPipe 也是这样应用的——它守在 @Body 的 CreateCatDto 上，校验失败直接抛 400 进入异常支线。',
          ],
          snippet: { path: 'sample/01-cats-app/src/common/pipes/parse-int.pipe.ts', code: 'async transform(value: string, metadata: ArgumentMetadata) {\n  const val = parseInt(value, 10);\n  if (isNaN(val)) {\n    throw new BadRequestException("Validation failed");\n  }\n  return val;\n}' },
          catsApp: '@Param("id", new ParseIntPipe())——参数级内联管道的最小示例。',
          path: 'sample/01-cats-app/src/common/pipes/parse-int.pipe.ts',
        },
        {
          no: 9, nav: '⑨ 执行 handler', title: 'CatsController.findOne(1)：业务执行',
          lead: 'CatsController', cast: [],
          edges: [['RouterExecutionContext', 'CatsController'], ['InterceptorsConsumer', 'CatsController']],
          text: [
            'handler 终于被调用——参数已是转换后的数字 1。控制器保持"薄"：接收参数、委托 CatsService，不写业务逻辑。',
            '注意它同时被两条线指向：管道喂参数、拦截器包裹调用——RxJS 的 handle() 触发的就是这一步。',
          ],
          snippet: { path: 'sample/01-cats-app/src/cats/cats.controller.ts', code: '@Get(\':id\')\nfindOne(\n  @Param(\'id\', new ParseIntPipe())\n  id: number,\n) {\n  console.log(id);   // 1（数字）\n}' },
          catsApp: 'cats.controller.ts 的 findOne——示例里只打印，真实项目会调用 CatsService。',
          path: 'sample/01-cats-app/src/cats/cats.controller.ts',
        },
        {
          no: 10, nav: '⑩ 拦截器·后置', title: '洋葱的另一半：map 与 tap',
          lead: 'TransformInterceptor', cast: [], edges: [['TransformInterceptor', 'RouterResponseController']],
          text: [
            'handler 的返回值流入洋葱后半段：TransformInterceptor 的 map 把结果包成 { data: ... }，LoggingInterceptor 的 tap 打印 "After... 3ms"。',
            '一次请求的耗时统计、响应改写、缓存填充，都发生在这个"后置窗口"。',
          ],
          catsApp: '此刻 findAll 的 Cat[] 变成了 { data: Cat[] }。',
          path: 'sample/01-cats-app/src/core/interceptors/transform.interceptor.ts',
        },
        {
          no: 11, nav: '⑪ 写响应', title: 'RouterResponseController：落盘',
          lead: 'RouterResponseController', cast: [], edges: [['RouterResponseController', 'ExpressAdapter']],
          text: [
            '响应写出器统一落盘：默认 res.status(200).json({ data: ... })；@HttpCode / @Header / @Redirect / @Render / @Sse 也都在这里生效。',
            '响应形态的多样性集中在一个类，管道其余部分只管计算数据——到这里，GET /cats/1 的主流程走完。',
          ],
          catsApp: '浏览器收到的 {"data":...} JSON 即它的输出。',
          path: 'packages/core/router/router-response-controller.ts',
        },
        {
          no: 12, nav: '⑫ 旅程回放', title: '把刚走过的路连起来',
          lead: null, cast: [], edges: [], play: true,
          text: [
            '回看整条链：中间件 → 守卫 → 拦截器前置 → 参数提取 → 管道转换 → handler → 拦截器后置 → 响应写出。',
            '点下方"▶ 连播本次旅程"，用 8 秒钟把这条路径再走一遍。',
          ],
          catsApp: '这就是面试里常问的"Nest 一次请求的完整生命周期"。',
          path: 'packages/core/router/router-execution-context.ts',
        },
        {
          no: 13, nav: '⑬ 异常支线', title: '异常支线：任何一环出错时的路',
          lead: 'ExceptionsHandler', cast: ['HttpExceptionFilter', 'BaseExceptionFilter'],
          edges: [['RouterProxy', 'ExceptionsHandler'], ['ExceptionsHandler', 'HttpExceptionFilter'], ['ExceptionsHandler', 'BaseExceptionFilter']],
          text: [
            '任何一环抛异常（比如 ParseIntPipe 收到 "abc"）：RouterProxy catch → ExceptionsHandler → 按 @Catch 类型匹配自定义过滤器（HttpExceptionFilter 输出 statusCode/timestamp/path）→ 未匹配则 BaseExceptionFilter 兜底 500。',
            '整个 HTTP 层只有这一个异常汇合点——管道抛出的 BadRequestException 能变成 400 响应，靠的就是这条支线。',
          ],
          snippet: { path: 'sample/01-cats-app/src/common/filters/http-exception.filter.ts', code: '@Catch(HttpException)\nexport class HttpExceptionFilter implements ExceptionFilter<HttpException> {\n  catch(exception: HttpException, host: ArgumentsHost) {\n    const ctx = host.switchToHttp();\n    const statusCode = exception.getStatus();\n    ctx.getResponse().status(statusCode).json({\n      statusCode, timestamp: new Date().toISOString(),\n      path: ctx.getRequest().url,\n    });\n  }\n}' },
          catsApp: 'common/filters/http-exception.filter.ts——经 @UseFilters 挂载后先于默认响应执行。',
          path: 'sample/01-cats-app/src/common/filters/http-exception.filter.ts',
        },
      ],
      layout: {
        'ExpressAdapter': { col: 1, row: 1 }, 'LoggerMiddleware': { col: 1, row: 2 },
        'RouterProxy': { col: 2, row: 1 }, 'RouterExecutionContext': { col: 2, row: 2 },
        'GuardsConsumer': { col: 3, row: 1 }, 'RolesGuard': { col: 3, row: 2 }, 'Reflector': { col: 3, row: 3 },
        'InterceptorsConsumer': { col: 4, row: 1 }, 'LoggingInterceptor': { col: 4, row: 2 }, 'TransformInterceptor': { col: 4, row: 3 },
        'RouteParamsFactory': { col: 5, row: 1 }, 'PipesConsumer': { col: 5, row: 2 },
        'ParamsTokenFactory': { col: 5, row: 3 }, 'cats-parse-int-pipe': { col: 5, row: 4 },
        'CatsController': { col: 6, row: 1 },
        'RouterResponseController': { col: 7, row: 1 },
        'ExceptionsHandler': { col: 7, row: 3 }, 'HttpExceptionFilter': { col: 7, row: 4 }, 'BaseExceptionFilter': { col: 7, row: 5 },
      },
    },
  ],
};
