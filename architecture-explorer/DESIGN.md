# NestJS 源码架构交互式探索页 — 设计文档

> 版本：v1.0 ｜ 日期：2026-09-15
> 源码基线：`C:\Users\Admin\Desktop\nest`（NestJS monorepo，`@nestjs/core` 等包版本 11.1.19）
> 示例入口：`sample/01-cats-app`
> 交付物目录：`C:\Users\Admin\Desktop\nest\architecture-explorer\`

---

## 1. 背景与目标

NestJS 框架源码分布在 `packages/` 下的 8 个包中，类数量庞大、协作链路长（一次 `NestFactory.create()` 背后牵动扫描、编译、依赖注入、路由注册等几十个类）。直接读源码难以建立全局图景。

本项目要做**一个纯本地、可交互的 HTML 页面**：

1. 以 `sample/01-cats-app` 为叙事主线，讲清楚"从 `main.ts` 的一行 `NestFactory.create()`，到一个 HTTP 请求被完整处理"的全过程；
2. 以**源码中真实定义的 class** 为图节点，展示各模块/类的作用与协作关系；
3. **点击任意类节点**，弹出该类的详情：设计理念、职责、源码位置、关键成员、上下游协作，以及它在 cats-app 中的"用武之地"。

### 非目标（本期不做）

- 不做源码浏览/代码高亮（只给源码路径，不内嵌完整代码）；
- 不覆盖 `@nestjs/microservices`、`@nestjs/websockets` 的内部实现细节（仅做总览级节点，见 §4.1 优先级）；
- 不做服务端/数据库，纯静态页面。

---

## 2. 受众与使用场景

| 受众 | 场景 |
|---|---|
| 正在阅读 NestJS 源码的开发者（主要） | 边读源码边查页面：某个类在哪条链路上、为什么要存在、和谁协作 |
| 准备深入框架原理的 NestJS 使用者 | 按阶段叙事通读一遍启动与请求处理全过程 |
| 团队内分享 / 面试复习 | 打开页面即可演示"一条请求在 Nest 里经历了什么" |

使用方式：**双击 `index.html` 即可**，零网络依赖（详见 §9）。

---

## 3. 总体设计思路（三条核心决策）

### 决策 1：叙事主线 = cats-app 的生命周期，而非"包目录树"

如果按 `packages/` 的目录组织页面，读者看到的是"仓库结构"，而不是"运行原理"。页面以 01-cats-app 的运行过程为线索，切成 **8 个阶段（Stage）**，每个阶段一张交互流程图：

| Stage | 名称 | 回答的问题 |
|---|---|---|
| 0 | 总览：包与依赖 | 8 个包各自是什么、谁依赖谁？ |
| 1 | 编译期：装饰器与元数据 | `@Module/@Controller/@Injectable` 到底往类上写了什么？ |
| 2 | 引导启动 | `NestFactory.create(AppModule)` 这一行背后发生了什么？ |
| 3 | 扫描与模块容器 | 模块树如何被发现、如何变成可管理的数据结构？ |
| 4 | 依赖注入与实例化 | `CatsService` 是怎么被 new 出来并注入 Controller 的？ |
| 5 | 中间件与路由注册 | `configure(consumer)` 和 `@Get(':id')` 何时被翻译成 Express 路由？ |
| 6 | 请求生命周期 | 一条 `GET /cats` 请求依次经过哪些框架类？ |
| 7 | 增强器四件套与异常处理 | Guard/Pipe/Interceptor/Filter 如何以统一的模式挂进管道？ |

每个 Stage 的图只包含**该阶段活跃的类**（15~25 个节点），避免一张巨图。

### 决策 2：节点 = 源码中真实存在的 class（少量接口/函数例外）

- 节点一律使用真实类名（如 `DependenciesScanner`），并标注源码相对路径；
- 纯接口（`PipeTransform`、`CanActivate` 等）和函数集（`hooks/*`）是理解协作不可缺少的"契约"，作为**虚线边框节点**收录，并在详情中注明"这是接口/函数，非 class"；
- 装饰器（`@Module` 等）本质是函数，按"功能组"合并为少量节点（如 `HTTP 方法装饰器组`），避免节点爆炸。

### 决策 3：内容与渲染彻底分离（数据驱动）

- 所有类的详情、关系边、阶段编排都放在一个数据文件 `data.js` 中（用 `window.__NEST_ARCH_DATA__ = {...}` 而非 JSON+fetch，保证 `file://` 协议直接打开不踩 CORS）；
- 渲染层只认数据结构，不硬编码任何类名。后续扩充/修订内容只改数据文件；
- 节点坐标在数据中以 `col/row`（列/行）声明，渲染器换算成 SVG 坐标 —— **不做自动布局**，保证每张图可人工排版到不重叠（详见 §7.3）。

---

## 4. 内容范围

### 4.1 覆盖的包与优先级

| 优先级 | 包 | 收录策略 | 预计节点数 |
|---|---|---|---|
| P0 | `@nestjs/core` | 全部核心类 | ~42 |
| P0 | `@nestjs/common` | 装饰器组 + 契约接口 + 内置管道/异常 + Logger | ~22 |
| P0 | `@nestjs/platform-express` | `ExpressAdapter` 等 3 个 | 3 |
| P1 | `@nestjs/testing` | `Test/TestingModule/TestingModuleBuilder/TestingInjector` | 4 |
| P2 | `@nestjs/websockets`、`@nestjs/microservices` | 仅总览节点（SocketModule、MicroservicesModule、NestMicroservice、ClientProxy、Server） | ~6 |
| — | `platform-fastify`、`platform-socket.io`、`platform-ws` | 不单独收录，在 `ExpressAdapter` 详情中说明"平台适配器模式还有这些兄弟实现" | 0 |

合计约 **75~80 个节点**，每节点一条详情记录（§5）。

### 4.2 分阶段类清单（P0 内容底稿）

以下类名与路径均已对照本仓库源码核实。路径省略包根（如 `injector/container.ts` 指 `packages/core/injector/container.ts`）。

#### Stage 0 总览
包级节点：`@nestjs/common`、`@nestjs/core`、`@nestjs/platform-express`、`@nestjs/testing`、`@nestjs/websockets`、`@nestjs/microservices`，边表达依赖方向（core→common、platform-express→core…）。

#### Stage 1 编译期（@nestjs/common 的静态部分）
| 节点 | 路径（packages/common/） | 一句话职责 |
|---|---|---|
| `Module` 装饰器 | `decorators/modules/module.decorator.ts` | 把 imports/providers/controllers/exports 写入类元数据 |
| `Global` 装饰器 | `decorators/modules/global.decorator.ts` | 标记模块全局可见 |
| `Injectable` 装饰器 | `decorators/core/injectable.decorator.ts` | 标记类可被注入并记录 scope |
| `Controller` 装饰器 | `decorators/core/controller.decorator.ts` | 标记控制器类并记录路径/版本 |
| `Catch` 装饰器 | `decorators/core/catch.decorator.ts` | 声明异常过滤器捕获的异常类型 |
| `UseGuards/UsePipes/UseInterceptors/UseFilters` 装饰器组 | `decorators/core/use-*.decorator.ts` | 在类/方法级绑定增强器元数据 |
| `SetMetadata` + `Reflector.createDecorator` | `decorators/core/set-metadata.decorator.ts` | 自定义元数据的写入通道（cats-app 的 `@Roles` 即基于它） |
| `Inject/Optional` 装饰器组 | `decorators/core/inject.decorator.ts`、`optional.decorator.ts` | 定制构造参数注入行为 |
| HTTP 方法装饰器组（`Get/Post/...`） | `decorators/http/request-mapping.decorator.ts` | 写入方法+路径元数据 |
| 路由参数装饰器组（`Param/Body/Query...`） | `decorators/http/route-params.decorator.ts` | 写入参数提取元数据（`ROUTE_ARGS_METADATA`） |
| `HttpCode/Header/Redirect/Render/Sse` 组 | `decorators/http/*.decorator.ts` | 响应行为元数据 |
| 元数据常量表 | `constants.ts` | `PATH_METADATA`、`METHOD_METADATA` 等键名约定（作为注释性节点） |

#### Stage 2 引导启动（@nestjs/core）
| 节点 | 路径（packages/core/） | 一句话职责 |
|---|---|---|
| `NestFactoryStatic`（导出为 `NestFactory`） | `nest-factory.ts` | 应用入口：装配容器/扫描器/加载器，创建 `NestApplication` |
| `NestApplication` | `nest-application.ts` | HTTP 应用运行时：init/listen、注册全局增强器 |
| `NestApplicationContext` | `nest-application-context.ts` | 应用上下文基类：get/resolve、生命周期钩子编排、关闭信号 |
| `ApplicationConfig` | `application-config.ts` | 全局配置仓库：全局前缀、版本化、全局增强器列表 |
| `AbstractHttpAdapter` | `adapters/http-adapter.ts` | 平台适配器抽象桥（实现 common 的 `HttpServer` 接口） |
| `ExpressAdapter` | `packages/platform-express/adapters/express-adapter.ts` | 包装 Express 实例，落地路由/中间件/监听 |
| `ExceptionsZone` | `errors/exceptions-zone.ts` | 启动阶段异常隔离区，兜底 `process.exit` |
| `ExceptionHandler` | `errors/exception-handler.ts` | 记录未捕获异常 |

#### Stage 3 扫描与模块容器
| 节点 | 路径（packages/core/） | 一句话职责 |
|---|---|---|
| `DependenciesScanner` | `scanner.ts` | 递归扫描模块树，注册进容器，绑定全局增强器 |
| `MetadataScanner` | `metadata-scanner.ts` | 遍历原型链收集方法名（带缓存） |
| `ModuleCompiler` | `injector/compiler.ts` | 把静态/动态/forwardRef 模块编译为 token+元数据 |
| `ByReferenceModuleOpaqueKeyFactory` | `injector/opaque-key-factory/by-reference-module-opaque-key-factory.ts` | 默认模块 token 策略（引用缓存/快照哈希） |
| `DeepHashedModuleOpaqueKeyFactory` | `injector/opaque-key-factory/deep-hashed-module-opaque-key-factory.ts` | 深哈希 token 策略，去重相同动态模块 |
| `NestContainer` | `injector/container.ts` | IoC 总账本：持有全部 Module、全局模块集合 |
| `ModulesContainer` | `injector/modules-container.ts` | `Map<token, Module>` + applicationId |
| `Module` | `injector/module.ts` | 单模块运行时表示：providers/controllers/injectables/exports |
| `InstanceWrapper` | `injector/instance-wrapper.ts` | 单个 provider 的核心数据结构（scope、按 ContextId 缓存实例） |
| `InternalCoreModule` + `InternalCoreModuleFactory` | `injector/internal-core-module/` | 内部全局模块：提供 `Reflector`、`ModuleRef`、`REQUEST`、`INQUIRER` 等 |
| `TopologyTree` / `TreeNode` | `injector/topology-tree/` | 模块依赖最短路树，用于距离计算与钩子遍历 |
| `Reflector` | `services/reflector.service.ts` | 元数据读取门面（`RolesGuard` 用它读 `@Roles`） |

#### Stage 4 依赖注入与实例化
| 节点 | 路径（packages/core/） | 一句话职责 |
|---|---|---|
| `InstanceLoader` | `injector/instance-loader.ts` | 两阶段引导：先原型壳，再并行实例化 |
| `Injector` | `injector/injector.ts` | 解析构造参数/属性，处理 scope、循环依赖、可选依赖 |
| `SettlementSignal` | `injector/settlement-signal.ts` | Promise 化的"实例就绪"信号（循环依赖破解关键） |
| `InstanceLinksHost` | `injector/instance-links-host.ts` | 全容器 token→InstanceLink 平铺索引 |
| `ModuleRef` | `injector/module-ref.ts` | 运行时 get/resolve/create API 基类 |
| `AbstractInstanceResolver` | `injector/abstract-instance-resolver.ts` | `ModuleRef` 与 `ApplicationContext` 共享的查找逻辑 |
| `InternalProvidersStorage` | `injector/internal-providers-storage.ts` | 存放 `HttpAdapterHost` 单例 |
| `LazyModuleLoader` | `injector/lazy-module-loader/lazy-module-loader.ts` | 运行期按需加载模块 |

#### Stage 5 中间件与路由注册
| 节点 | 路径 | 一句话职责 |
|---|---|---|
| `MiddlewareModule` | `middleware/middleware-module.ts`（core） | 中间件子系统总指挥：执行 `configure()`、注册到适配器 |
| `MiddlewareContainer` | `middleware/container.ts`（core） | 存储各模块中间件配置与包装 |
| `MiddlewareResolver` | `middleware/resolver.ts`（core） | 委托 `Injector.loadMiddleware` 实例化中间件 |
| `MiddlewareBuilder` | `middleware/builder.ts`（core） | `apply().forRoutes()` 流式 API 实现 |
| `RoutesMapper` | `middleware/routes-mapper.ts`（core） | 把控制器/路径映射为 `RouteInfo[]` |
| `RouteInfoPathExtractor` | `middleware/route-info-path-extractor.ts`（core） | 展开 `forRoutes` 为真实挂载路径（含全局前缀/版本） |
| `RoutesResolver` | `router/routes-resolver.ts`（core） | 路由注册入口 + 404/异常兜底挂载 |
| `RouterExplorer` | `router/router-explorer.ts`（core） | 协调路径探索→执行上下文→代理→挂载全流程 |
| `PathsExplorer` | `router/paths-explorer.ts`（core） | 扫描控制器方法为路由定义 |
| `RoutePathFactory` | `router/route-path-factory.ts`（core） | 拼装最终路径：版本→模块→控制器→方法→全局前缀 |
| `RouterMethodFactory` | `helpers/router-method-factory.ts`（core） | RequestMethod 枚举 → 适配器的 get/post/... |
| `RouterProxy` | `router/router-proxy.ts`（core） | 把 handler 包装成 (req,res,next)，异常导入过滤器链 |
| `RouterExceptionFilters` | `router/router-exception-filters.ts`（core） | 编译每条路由的异常过滤器链 |

#### Stage 6 请求生命周期
| 节点 | 路径 | 一句话职责 |
|---|---|---|
| `RouterExecutionContext` | `router/router-execution-context.ts`（core） | 单条路由的完整管道构建器（本次请求的"总调度"） |
| `RouteParamsFactory` | `router/route-params-factory.ts`（core） | 按 `RouteParamtypes` 从 req/res/next 取参数 |
| `RouterResponseController` | `router/router-response-controller.ts`（core） | 写出响应：HttpCode/Header/Redirect/Render/SSE |
| `SseStream` | `router/sse-stream.ts`（core） | SSE 输出流 |
| `ExceptionsHandler` | `exceptions/exceptions-handler.ts`（core） | 路由异常第一站：先试自定义过滤器链，再兜底 |
| `BaseExceptionFilter` | `exceptions/base-exception-filter.ts`（core） | 最终兜底：HttpException→对应状态码，其余→500 |
| `HttpException` 及子类 | `exceptions/*.exception.ts`（common） | 携带状态码的异常体系 |
| `ArgumentsHost` / `ExecutionContext` | `interfaces/features/*.ts`（common，接口节点） | 跨上下文（HTTP/RPC/WS）的参数抽象 |

#### Stage 7 增强器四件套与异常处理
| 节点 | 路径 | 一句话职责 |
|---|---|---|
| `ContextCreator`（抽象基类） | `helpers/context-creator.ts`（core） | "全局→类→方法"三元合并的模板方法 |
| `GuardsContextCreator` / `GuardsConsumer` | `guards/*.ts`（core） | Guard 的收集器/执行器 |
| `PipesContextCreator` / `PipesConsumer` | `pipes/*.ts`（core） | Pipe 的收集器/执行器（reduce 链式应用） |
| `ParamsTokenFactory` | `pipes/params-token-factory.ts`（core） | 参数元数据 → body/param/query/custom |
| `InterceptorsContextCreator` / `InterceptorsConsumer` | `interceptors/*.ts`（core） | Interceptor 的收集器/RxJS 链执行器 |
| `BaseExceptionFilterContext` | `exceptions/base-exception-filter-context.ts`（core） | Filter 元数据编译基类 |
| `ExternalContextCreator` | `helpers/external-context-creator.ts`（core） | 为 WS/RPC/GraphQL 构建等价管道 |
| `ValidationPipe` | `pipes/validation.pipe.ts`（common） | 基于 class-validator 的校验管道（cats-app 全局注册） |
| `Parse*Pipe` 系列 | `pipes/parse-*.pipe.ts`（common） | 内置标量转换管道 |
| `ClassSerializerInterceptor` | `serializer/class-serializer.interceptor.ts`（common） | 响应序列化拦截器 |
| `CanActivate/PipeTransform/NestInterceptor/ExceptionFilter` | `interfaces/features/*.ts`（common，接口节点） | 四件套的契约 |
| `Logger` / `ConsoleLogger` | `services/logger.service.ts`、`console-logger.service.ts`（common） | 日志门面/控制台实现 |

#### 附 Stage（P1/P2，可后置）
- 生命周期钩子：`OnModuleInit/OnModuleDestroy/OnApplicationBootstrap/OnApplicationShutdown/BeforeApplicationShutdown`（common `interfaces/hooks/`，接口节点）+ core `hooks/*` 函数组 + `NestApplicationContext.callDestructor` 链路 + `ShutdownSignal`；
- 测试：`Test`、`TestingModule`、`TestingModuleBuilder`、`TestingInjector`（testing 包）；
- 生态总览：`SocketModule`/`WebSocketsController`（websockets）、`NestMicroservice`/`MicroservicesModule`/`ClientProxy`/`Server`（microservices）。

### 4.3 cats-app ↔ 框架类对应表（详情面板的 "在 cats-app 中" 字段素材）

| cats-app 文件/代码 | 触发的框架类 | 所在 Stage |
|---|---|---|
| `main.ts` → `NestFactory.create(AppModule)` | `NestFactoryStatic` → `ApplicationConfig`/`NestContainer`/`DependenciesScanner` | 2/3 |
| `main.ts` → `app.useGlobalPipes(new ValidationPipe())` | `NestApplication` → `ApplicationConfig.globalPipes` → `PipesContextCreator` | 2/7 |
| `main.ts` → `app.listen(3000)` | `NestApplication.listen` → `ExpressAdapter.listen` | 2 |
| `app.module.ts` 的 `@Module({imports:[...]})` | `Module` 装饰器 → `ModuleCompiler` → `Module` | 1/3 |
| `cats.service.ts` 的 `@Injectable()` + 构造注入 | `Injector.resolveConstructorParams` → `CatsService` 实例进 `InstanceWrapper` | 4 |
| `cats.controller.ts` 的 `@Controller('cats')`、`@Get(':id')` | `PathsExplorer`/`RoutePathFactory` → `/cats/:id` | 5 |
| `@UseGuards(RolesGuard)` | `GuardsContextCreator.createContext` | 7 |
| `@Roles(['admin'])`（`Reflector.createDecorator` 实现） | `Reflector.get` 在 `RolesGuard.canActivate` 中读取 | 7 |
| `@Param('id', new ParseIntPipe())` | `ParamsTokenFactory` + `PipesConsumer.apply` | 6/7 |
| `core/core.module.ts` 的 `APP_INTERCEPTOR` | `DependenciesScanner` 收集 → `ApplicationConfig.globalInterceptors` → `InterceptorsContextCreator` | 3/7 |
| `common/middleware/logger.middleware.ts` + 模块 `configure(consumer)` | `MiddlewareModule` → `MiddlewareBuilder.forRoutes` → 适配器挂载 | 5 |
| `common/filters/http-exception.filter.ts`（`@Catch(HttpException)`） | `RouterExceptionFilters` → `ExceptionsHandler` | 6/7 |
| `core/interceptors/transform/logging.interceptor.ts` | `InterceptorsConsumer.intercept` RxJS 链 | 6/7 |

---

## 5. 数据模型

三个顶层集合：`nodes`（类详情）、`edges`（关系边，全局一份，按 stage 过滤展示）、`stages`（阶段编排与布局）。

### 5.1 Node（类详情记录）

```js
{
  id: "DependenciesScanner",            // 唯一，通常即类名
  kind: "class",                        // class | interface | functionGroup | decoratorGroup | package | constants
  name: "DependenciesScanner",
  package: "@nestjs/core",
  path: "packages/core/scanner.ts",     // 仓库内相对路径，面板中原样展示
  categories: ["scan"],                 // 决定节点配色（见 §7.2 图例）
  summary: "递归扫描模块树并把每个模块注册进 NestContainer",
  design: "设计理念正文（2~5 段）：为什么存在、核心权衡、亮点手法…",
  keyMembers: [
    { name: "scan(module)", desc: "入口：注册内部模块后递归 scanModulesForDependencies" },
    { name: "calculateModulesDistance()", desc: "基于 TopologyTree 计算模块距离，供钩子排序使用" }
  ],
  catsApp: "app.module.ts 的 imports 数组就是被它逐个递归展开的…",
  source: { extends: [], implements: [] },
  seeAlso: ["NestContainer", "MetadataScanner"]   // 详情面板可点击跳转
}
```

字段内容规范：

- `design` 必须回答三问：**解决什么问题 → 核心设计手法（模板方法/两阶段/代理…）→ 代价与权衡**；控制在 200~400 字，配 1~2 段伪代码或调用摘录（≤10 行，转义进数据）；
- `summary` 一句话 ≤30 字；
- `catsApp` 可为空（纯内部类），但 Stage 2~7 的骨干类尽量都写。

### 5.2 Edge（关系边）

```js
{
  from: "NestFactoryStatic", to: "NestContainer",
  type: "creates",          // creates | calls | extends | implements | registers | scans | resolves | throws-to
  label: "创建 IoC 容器",
  stages: [2, 3]            // 在哪些阶段的图中出现
}
```

### 5.3 Stage（阶段编排）

```js
{
  id: 2,
  title: "引导启动",
  question: "NestFactory.create(AppModule) 这一行背后发生了什么？",
  narrative: "本阶段的引导文字（页面顶部横幅，3~5 句）",
  nodes: ["NestFactoryStatic", "NestApplication", /* … */],
  layout: {
    lanes: ["调用方", "工厂", "容器", "平台适配"],     // 泳道名（横向分列）
    pos: { NestFactoryStatic: { col: 1, row: 1 }, NestApplication: { col: 2, row: 1 } }
  },
  catsAppHint: "对应 main.ts 的第 6 行：const app = await NestFactory.create(AppModule)"
}
```

---

## 6. 页面布局

```
┌──────────────────────────────────────────────────────────────────────────┐
│  NestJS 源码架构探索   [总览|启动|扫描|注入|路由|请求|增强器|钩子/生态]  🔍搜索 │
├────────────┬──────────────────────────────────────────────┬──────────────┤
│ 左栏 240px  │               中央视图（SVG 画布）              │  右栏 360px   │
│ 包/目录树   │   ┌──────┐      ┌──────────┐                  │  详情面板      │
│ ▸ @nestjs/  │   │Node A│─────▶│ Node B   │◀─┐              │  (选中类时展示) │
│   core      │   └──────┘      └──────────┘  │              │  ▸ 一句话定位   │
│   common    │        │        ┌──────────┐  │              │  ▸ 设计理念     │
│ ▸ platform/ │        └───────▶│ Node C   │──┘              │  ▸ 关键成员     │
│   express   │                 └──────────┘                 │  ▸ 协作关系     │
│ …           │   [滚轮缩放 拖拽平移 框选缩放复位]               │  ▸ 源码位置     │
│            │                                              │  ▸ 在cats-app中│
├────────────┴──────────────────────────────────────────────┴──────────────┤
│ 底部叙事条：Stage 描述 + 「⟵ 上一步 | 下一步 ⟶」 + 本阶段 cats-app 对应提示    │
└──────────────────────────────────────────────────────────────────────────┘
```

- **顶部**：阶段 Tab（即 8 个 Stage）+ 全局搜索（类名/描述/路径模糊匹配，回车后在当前图定位或弹出匹配列表）；
- **左栏**：按 包 → 目录 的静态树（与 `packages/` 真实目录一致），叶子是类；点击 = 选中并打开详情；若该类不属于当前 Stage，自动提示"该类活跃于 Stage X，是否跳转"；
- **中央**：SVG 流程图画布（交互见 §8）；
- **右栏**：详情面板（字段见 §5.1）；未选中时显示当前 Stage 的"阶段导读"（narrative + cats-app 对应）；
- **底部**：叙事条，形成"引导式通读"动线；自由模式下可忽略。

---

## 7. 流程图设计

### 7.1 图的形态

- **有向图，泳道分层布局**：每个 Stage 声明若干"泳道"（如 Stage 6 的 `Express 适配器 → 中间件 → Guard → Interceptor → Pipe → Handler → 响应`），节点按 `col/row` 落格；
- 边为贝塞尔曲线箭头，`type` 决定线型：实线（创建/调用）、加粗（继承/实现）、虚线（扫描/元数据读取）；
- 请求生命周期图（Stage 6）额外支持**动画模式**：点击"播放一次 GET /cats/1"，一个光点沿 中间件→Guard→Interceptor→Pipe→Handler→响应 路径流动，途经节点依次点亮 —— 这是页面最直观的演示功能。

### 7.2 节点视觉

- 圆角矩形，高 44px，宽按类名自适应（120~200px）；
- 上行：类名（等宽字体）；下行：包名缩写（`core`/`common`/`express`…）；
- 配色按 categories：启动(蓝)、扫描(青)、容器/DI(紫)、路由(橙)、增强器(绿)、异常(红)、契约接口(灰+虚线框)、平台(棕)、cats-app 业务类(黄，仅 Stage 1/6 中少量出现，如 `CatsController`）；
- 左上角小徽标区分 kind：class=实心、interface=I、decorator=@、function=f。

### 7.3 关键图示意（文字版）

**Stage 2 引导启动主链（简化）：**

```
main.ts:bootstrap()
   │ await
   ▼
NestFactoryStatic.create ──creates──▶ ApplicationConfig（全局配置仓库）
   │  creates                                  ▲ registers
   ├─creates─▶ NestContainer ──────────────────┘（APP_* 全局增强器经 scanner 落入 config）
   │              ▲ scan
   ├─creates─▶ DependenciesScanner
   │              ▼ 注册模块
   ├─creates─▶ InstanceLoader（实例化全部 providers）
   ▼
NestApplication ──init──▶ MiddlewareModule.register → RoutesResolver.resolve → ExpressAdapter
   │ listen
   ▼
ExpressAdapter.listen(3000)   全程包裹于 ExceptionsZone.run()
```

**Stage 6 请求生命周期（泳道，简化）：**

```
[请求] GET /cats/1
  Express(req,res,next) ─▶ LoggerMiddleware.use（cats-app 自定义）
        │ next()
        ▼
  RouterProxy 代理层 ─▶ RouterExecutionContext 构建的管道：
        ① GuardsConsumer.tryActivate(RolesGuard ← Reflector.get(@Roles))
        ② InterceptorsConsumer（Transform→Logging，RxJS tap 先序执行）
        ③ RouteParamsFactory + ParamsTokenFactory + PipesConsumer（ParseIntPipe 转换 :id）
        ④ handler: CatsController.findOne(id)
        ⑤ Interceptor 后序（map 日志） ─▶ RouterResponseController.apply/transform
        ▼
  [响应] 200 JSON
  任意环节 throw ─▶ ExceptionsHandler ─▶ @Catch 过滤器链(HttpExceptionFilter) ─▶ BaseExceptionFilter
```

### 7.4 布局与防重叠策略

- 坐标 = 泳道列宽 × col + 行高 × row，泳道列宽默认 220px、行高 72px；
- 数据编写时人工排布，渲染器只做两件事：同格冲突检测（控制台警告，开发期用）与整体居中；
- 允许个别节点声明 `offset:{x,y}` 微调，处理长边交叉。

---

## 8. 交互设计

| # | 交互 | 行为 |
|---|---|---|
| 1 | 点击节点 | 选中：右栏渲染详情；节点高亮描边；左栏树同步定位展开 |
| 2 | 悬停节点 | 该节点 + 一跳邻边/邻点保持正常亮度，其余淡出至 15% 透明度；边标签放大可读 |
| 3 | 点击边 | 右栏显示边详情（协作方式说明、发生在哪个阶段） |
| 4 | 画布缩放/平移 | 滚轮以指针为中心缩放（0.4x~2.5x）；空白处拖拽平移；双击空白复位 |
| 5 | 搜索 | 顶部输入框：匹配 name/summary/path；下拉结果点击后，若类在当前 Stage 直接定位居中，否则提示跳转对应 Stage |
| 6 | 详情内跳转 | `seeAlso` 与关系列表中的类名均为可点击 chip，点击即切换选中（必要时切 Stage） |
| 7 | 阶段切换 | 顶部 Tab；底部"上一步/下一步"按 Stage 顺序推进（叙事模式） |
| 8 | 播放请求动画 | 仅 Stage 6：沿主路径光点动画 + 途经节点顺序点亮，约 6 秒，可中断 |
| 9 | 源码路径 | 详情面板的路径文本支持"复制"按钮（不尝试直接打开本地文件，避免浏览器安全限制） |
| 10 | 键盘 | `←/→` 切换 Stage；`Esc` 取消选中；`/` 聚焦搜索 |

无障碍：节点同时渲染为可聚焦元素（SVG `tabindex` + `role="button"`），详情面板内容对屏幕阅读器可见。

---

## 9. 技术选型

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A. 原生 HTML/CSS/JS + 自绘 SVG（数据驱动） | 零依赖、file:// 直开、完全掌控交互与布局、体积小（<200KB 含数据） | 缩放/平移/曲线连线需手写（约 300 行，成熟模式） | ✅ **采用** |
| B. Mermaid.js | 声明式画图快 | 布局不可控、点击/悬停交互弱、大图易乱 | ❌ |
| C. AntV X6/G6（CDN） | 交互与布局开箱即用 | 依赖网络或需内嵌 ~1MB 库；定制泳道叙事反而绕 | ❌（备选：若后续要自动布局再引入） |

技术要点：

- 纯静态 3~4 个文件：`index.html` + `app.js`（渲染与交互）+ `data.js`（内容数据）+ `style.css`；
- 数据以 `window.__NEST_ARCH_DATA__ = {...}` 注入（**不用 fetch 加载 JSON**，规避 `file://` 下的 CORS 限制）；
- SVG 手写：节点 `<g><rect><text>`，边三次贝塞尔 `<path>` + 箭头 `<marker>`；视口变换用一个 `<g transform>` 实现；悬停淡出用 CSS class 切换，不引入动画库；
- 请求播放动画用 `requestAnimationFrame` 沿预计算的路径采样点移动 `<circle>`；
- 兼容 Chrome/Edge 最新版即可（本地自用工具，不做旧浏览器兼容）。

---

## 10. 交付物与文件结构

```
architecture-explorer/
├── DESIGN.md            # 本文档
├── index.html           # 页面骨架
├── style.css            # 样式（含深/浅色变量）
├── app.js               # 渲染引擎 + 交互（无框架，约 1200 行）
└── data.js              # 全部内容数据（nodes/edges/stages，持续扩充）
```

---

## 11. 实施计划

| 里程碑 | 内容 | 产出 |
|---|---|---|
| M1 骨架与渲染引擎 | index/app.js/style 搭建；SVG 节点/边渲染、泳道布局、缩放平移、悬停淡化、点击选中详情面板；数据模型定型 | 可用 Stage 2（引导启动，~12 节点）跑通全链路 |
| M2 内容底稿（P0） | 按 §4.2 编写 core/common/express 全部节点数据与边（约 75 节点、150+ 边），重点打磨 `design` 字段 | data.js 覆盖 Stage 0~7 |
| M3 叙事与导航 | 8 个 Stage 编排、底部叙事条、左栏包树、搜索、seeAlso 跳转 | 全部 Stage 可浏览 |
| M4 请求动画与打磨 | Stage 6 播放动画、边详情、配色/图例、深色主题 | 演示就绪 |
| M5 P1/P2 扩充（可选） | 钩子/关闭链路、testing、ws/ms 总览节点 | 内容完全体 |

---

## 12. 验收标准

1. 双击 `index.html`（无网络）可完整使用全部功能；
2. Stage 0~7 均可浏览，节点总数 ≥75，全部可点击且详情非空（`design` 字段齐全）；
3. 悬停淡化、搜索定位、跨 Stage 跳转、播放动画全部可用；
4. 1080p 分辨率下每张 Stage 图节点/标签无重叠，边交叉可辨；
5. 所有类名、路径与仓库源码一致（抽查 20 处无误）。

## 13. 风险与开放问题

| 风险 | 应对 |
|---|---|
| 内容工作量大（75 个类的 design 字段需逐个读源码撰写） | M2 按"骨干类优先"两批交付：先 30 个骨干（启动/注入/请求链），其余补齐 |
| 手工布局边交叉难看 | 泳道约束 + 分 Stage 小图（≤25 节点）已把复杂度压到可控；个别长边用 `offset` 微调 |
| `design` 内容主观/有误 | 每条内容标注依据（源码路径+关键方法名），便于读者回查源码验证 |
| 后续想加 ws/ms 深度内容 | 数据模型已预留 stages 扩展位，不影响现有结构 |
```
