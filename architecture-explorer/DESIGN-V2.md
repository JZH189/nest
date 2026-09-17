# NestJS 源码跟读页 · 设计文档 v2 —— 从"架构图集"到"跟读旅程"

> 版本：v2.0 ｜ 日期：2026-09-15
> 前版：DESIGN.md（v1，参考模式的完整设计，本版保留其成果作为二级模式）
> 源码基线：`packages/*` @ 11.1.19 ＋ `sample/01-cats-app`

---

## 1. 现状诊断：为什么 v1"不好用"

v1 已解决了渲染问题（无重叠、可交互），但使用体验仍差，根因是**设计维度错位**：

| # | 问题 | 表现 |
|---|---|---|
| 1 | **认知过载** | 单屏 15~24 节点 + 20 条连线一次性铺开，读者要先学会"读这套图"才能学 Nest；工作记忆装不下一张 20 节点的图 |
| 2 | **组织维度是源码视角，不是学习者视角** | 按框架子系统分 9 个 Stage（扫描/注入/路由/增强器…），这是给"已经懂的人查资料"的切法；新手的问题是"main.ts 怎么跑起来的"，而不是"injector 子系统有哪些类" |
| 3 | **信息平权，没有阅读动线** | 所有节点同样大小、同等亮度，没有"先看哪个"的指引；叙事文字压在顶部横幅里，图是主角、文字是配角，本末倒置 |
| 4 | **图文割裂** | 解说在右栏、现场在中央，视线来回横跳；读一段设计理念要同时在图上找 5 个类 |
| 5 | **界面自身的学习成本** | 9 个 Tab + 左侧树 + 分类图例 + 4 种线型约定 + 底部叙事条，还没学 Nest 先学了一套 UI 规则 |

**结论**：v1 是"地图"，学习者需要的是"向导"。地图应该保留，但只能是第二层。

---

## 2. 从源码架构出发的两条主线

NestJS 运行时的架构本质可以压缩成一句话：

> **启动期：把用户的装饰器声明"编译"成容器里的实例图和每条路由的闭包管道；请求期：只是执行这些已编译好的闭包。**

这句话对应两条真实、完整、可验证的调用链，也是本设计的骨架：

### 主线 A：启动链（main.ts → listen 完成）
`NestFactoryStatic.create()` 内部的实际次序（依据 `nest-factory.ts` 及其调用链）：
**装配适配器 → 建容器 → 扫描模块树 → 实例化依赖 → new NestApplication → init()（中间件+路由注册+钩子）→ listen**。

### 主线 B：请求链（GET /cats/1 进 → 响应出）
`RouterExecutionContext` 在启动期编译出的管道的实际执行次序：
**中间件 → 代理闭包 → 守卫 → 拦截器前置 → 参数提取 → 管道转换 → handler → 拦截器后置 → 响应写出**（异常任何时候汇入过滤器链）。

两条链都是"从用户代码出发、按真实调用次序展开"，不需要读者先理解任何子系统划分。

---

## 3. v2 设计：跟读旅程（Journey Mode）为核心

### 3.1 三条核心设计原则

1. **一次一步**：任一时刻屏幕只讲"一件事"——一个类（或一组协作），配一段话、一段真实代码摘录；
2. **图随步长**：流程图随步骤**逐步生长**——第 N 步看到的图 = 前 N 步已学到的类，永不超载（这是解决"图看不懂"的关键机制）；
3. **从 cats-app 出发**：每一步都回答"这步和我写的哪行代码有关"。

### 3.2 信息架构

首屏即三选一，不需要任何解释：

```
┌──────────────────────────────────────────────────────────────┐
│   NestJS 源码跟读（入口：sample/01-cats-app）                   │
│                                                              │
│   ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│   │ ▶ 启动旅程       │  │ ▶ 请求旅程      │  │ 🗺 架构地图     │  │
│   │ main.ts 的 3 行  │  │ GET /cats/1 的  │  │ 9 张子系统全图  │  │
│   │ 代码背后 · 16 步 │  │ 完整旅程 · 13 步 │  │ （读过旅程再查）│  │
│   └────────────────┘  └────────────────┘  └───────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **旅程 A/B**：核心模式（新做）；
- **架构地图**：v1 的 9 个 Stage 原样保留，入口降级——完成旅程后回来查全貌、看某个子系统的完整协作，这才是图集的正确使用场景（搜索/左侧树/详情面板都在这里）。

### 3.3 旅程模式界面（线框）

```
┌────────────────────────────────────────────────────────────────────┐
│ ◀ 返回首页    启动旅程 · 第 9/16 步    [🗺 看此阶段全图]              │
├──────────┬─────────────────────────────────────────────────────────┤
│ 步骤导航   │                                                         │
│ ① main.ts │      画布：随步骤生长的流程图                              │
│ ② create  │      （只有前 9 步出现过的类；当前主角呼吸高亮，             │
│ ③ 保护圈   │        上一步刚加入的节点/连线有描线动画）                  │
│ ④ 适配器   │                                                         │
│ ⑤ 配置仓库 │                                                         │
│ …         │                                                         │
│ ▸⑨ 扫描器  ├─────────────────────────────────────────────────────────┤
│ …         │ ⑨ 递归扫描：模块树进容器                                   │
│           │ DependenciesScanner.scan() 从 AppModule 出发读 @Module    │
│ (可点击    │ 元数据，把 imports 逐个编译登记进 NestContainer…           │
│  任意跳转) │ ┌────────────────────────────────────────────┐          │
│           │ │ // packages/core/scanner.ts（摘录）           │          │
│           │ │ scan(module) { this.scanModulesFor… }        │          │
│           │ └────────────────────────────────────────────┘          │
│           │ 🐱 对应：app.module.ts 的 imports:[CoreModule,CatsModule] │
│           │ 📄 packages/core/scanner.ts          [← 上一步] [下一步 →] │
└──────────┴─────────────────────────────────────────────────────────┘
```

要点：

- **解说卡在底部固定区域**：视线动线 = 看现场（图）→ 读解释（卡）→ 点下一步，不再左右横跳；
- **左侧步骤导航**：步骤名就是类名/动作名（`① main.ts`、`⑨ 扫描器`），既是进度条也是目录，点击任意跳转；
- **键盘**：`→`/空格 下一步，`←` 上一步，`Esc` 返回首页；
- **节点可点**：生长图里的任何节点仍可点击打开详情（复用 v1 详情面板，浮层化）；
- **每步一个"看全图"快捷入口**：跳到架构地图中该类所属的 Stage。

### 3.4 旅程 A：启动旅程（16 步，每步 = 真实调用链上的一站）

| 步 | 主角 | 一句话 | 源码依据 |
|---|---|---|---|
| 1 | `main.ts` | 业务侧只有 3 行有效代码：create / useGlobalPipes / listen | sample/01-cats-app/src/main.ts |
| 2 | `NestFactoryStatic` | 唯一入口，装配次序全在这里定死 | core/nest-factory.ts · create() |
| 3 | `ExceptionsZone` | 启动保护圈：任何装配失败→记录并退出 | core/errors/exceptions-zone.ts · asyncRun |
| 4 | `ExpressAdapter` | 懒加载平台适配器（core 不认识 Express） | nest-factory.ts · loadAdapter → require |
| 5 | `ApplicationConfig` | 全局配置仓库先建好（后面 globalPipes 存这里） | core/application-config.ts |
| 6 | `NestContainer` | IoC 账本：ModulesContainer/ModuleCompiler 就位 | core/injector/container.ts |
| 7 | `InternalCoreModule` | 框架先注册自己的 provider（Reflector 等） | scanner.ts 首个动作 |
| 8 | 装饰器元数据回看 | @Module/@Controller/@Injectable 早已写好数据 | common/decorators/*（回看 Stage① 的知识） |
| 9 | `DependenciesScanner` | 从 AppModule 递归展开 imports 树 | core/scanner.ts · scan/scanModulesForDependencies |
| 10 | `ModuleCompiler` + OpaqueKey | 每个 import 编译出唯一 token | injector/compiler.ts + opaque-key-factory/* |
| 11 | `Module` + `InstanceWrapper` | CatsModule 的成员全部记成 wrapper | injector/module.ts / instance-wrapper.ts |
| 12 | `InstanceLoader` | 两阶段加载：先原型壳，再并行实例化 | injector/instance-loader.ts |
| 13 | `Injector` | resolveConstructorParams：CatsService 注入 CatsController | injector/injector.ts |
| 14 | `NestApplication` | new 完成、create 返回；useGlobalPipes 只是登记 | nest-application.ts |
| 15 | `NestApplication.init` | 中间件注册→路由注册→钩子（Mapped 日志在此打出） | init() 调 MiddlewareModule/RoutesResolver |
| 16 | `ExpressAdapter.listen` | 端口监听，"Application is running on…" | 平台适配器收尾 |

### 3.5 旅程 B：请求旅程（13 步 + 异常支线）

| 步 | 主角 | 一句话 | 源码依据 |
|---|---|---|---|
| 1 | `ExpressAdapter` | GET /cats/1 到达 httpServer | express 实例收到请求 |
| 2 | `LoggerMiddleware` | （若配置）"Request..." 日志 | common/middleware/logger.middleware.ts |
| 3 | `RouterProxy` | 进入路由闭包，异常保护圈就位 | router/router-proxy.ts · createProxy |
| 4 | `GuardsConsumer` → `RolesGuard` | 守卫链：GET 无 @Roles 放行；POST create 才校验 admin | guards/*.ts + Reflector.get |
| 5 | `InterceptorsConsumer` | LoggingInterceptor 前置："Before..." | interceptors-consumer.ts（RxJS 链从后往前包） |
| 6 | `RouteParamsFactory` | 提取 req.params.id = "1" | router/route-params-factory.ts |
| 7 | `ParamsTokenFactory` | 归类：param + data:'id' | pipes/params-token-factory.ts |
| 8 | `PipesConsumer` → `ParseIntPipe` | "1" → 1；失败抛 BadRequestException | common/pipes + pipes-consumer.ts |
| 9 | `CatsController.findOne(1)` | 业务执行 | cats/cats.controller.ts |
| 10 | 拦截器后置 | Transform map 包裹 {data}、Logging tap "After… xms" | RxJS 洋葱的另一半 |
| 11 | `RouterResponseController` | res.status(200).json({data:…}) | router/router-response-controller.ts |
| 12 | 响应完成 | 回到 Express 写出 | —— |
| 13 | ⚡异常支线（可选步） | BadRequestException → ExceptionsHandler → HttpExceptionFilter → BaseExceptionFilter | exceptions/*.ts |

（播放动画保留在旅程 B 末尾："把刚走过的 13 步连起来放一遍"。）

### 3.6 与 v1 的关系（全部复用，不推翻）

| v1 资产 | v2 去向 |
|---|---|
| nodes（110 个类详情：设计理念/成员/协作/路径/cats-app） | 完全复用：旅程每步的"点开主角看详情"= 同一份数据 |
| 边路由引擎 v2（避让/扇形/标签防碰撞） | 完全复用：旅程的生长图每步重渲染，节点更少、引擎压力更小 |
| 9 个 Stage 全图 + 搜索 + 树 + 详情面板 | 收进"架构地图"入口，原样保留 |
| 请求播放动画 | 移到旅程 B 结尾 |

---

## 4. 数据模型增量（data.js 追加，不改现有结构）

```js
journeys: [
  {
    id: 'bootstrap', title: '启动旅程', subtitle: 'main.ts 的 3 行代码背后',
    steps: [
      {
        no: 9, nav: '⑨ 扫描器',
        title: '递归扫描：模块树进容器',
        lead: ['DependenciesScanner', 'DependenciesScanner'],       // 主角（高亮/呼吸）
        cast: ['AppModule', 'CoreModule', 'CatsModule'],            // 本步登场的其他类
        text: ['一段解释……', '第二段……'],
        snippet: { path: 'packages/core/scanner.ts', code: 'scan(module) {\n  …' },
        catsApp: '对应 app.module.ts 的 imports: [CoreModule, CatsModule]',
        edges: [ ['DependenciesScanner','AppModule'], … ]           // 本步"点亮"的协作边
      },
      …
    ],
    layout: { /* 旅程画布的固定网格 pos（16 节点一次排好，按调用次序蛇形分布） */ }
  },
  { id: 'request', … }
]
```

## 5. 实施计划

| 里程碑 | 内容 | 量级估计 |
|---|---|---|
| M1 旅程框架 | 首屏三入口、步骤驱动渲染（生长图复用现有引擎）、底部解说卡、键盘/导航 | app.js +~300 行 |
| M2 旅程 A 内容 | 16 步文案 + 代码摘录 + layout | data.js +~250 行 |
| M3 旅程 B 内容 | 13 步 + 异常支线 + 结尾连播 | data.js +~200 行 |
| M4 收尾 | 首页/过渡动画、"看全图"跳转、架构地图入口降级改造 | 小 |

不新增任何依赖；`index.html` 双击离线可用的性质不变。

## 6. 验收标准

1. 新用户从打开页面到"开始第一步"零思考（首屏即三按钮）；
2. 任一旅程任意步骤，画布节点数 ≤ 已讲解的类数（图=已学内容）；
3. 每步解说 ≤150 字 + ≤10 行摘录，2 分钟可消化一步，全程 30 分钟内跟完两条旅程；
4. 旅程中任意节点可打开 v1 详情；架构地图功能不回退；
5. 键盘 ←/→/空格/Esc 全程可用。
