# NestJS 请求生命周期：中间件 / 守卫 / 拦截器 / 管道 / 异常过滤器的调用时机与源码位置

> 基于本仓库 `packages/` 源码分析。所有路径均相对于 `C:\Users\Admin\Desktop\nest\packages\`。

## 一、总览：一次 HTTP 请求的完整执行顺序

```
请求进入底层 HTTP 服务器（Express / Fastify）
│
├─ ① 中间件 Middleware（body-parser 等内置解析 + 用户 configure() 声明的中间件）
│     └─ instance.use(req, res, next)
│
├─ ② 守卫 Guards（全部通过才放行，任一返回 false → 403）
│     └─ guard.canActivate(context)
│
├─ ③ 设置响应状态码 / 响应头（@HttpCode / @Header）
│
├─ ④ 拦截器前置逻辑 Interceptors（RxJS 链，next.handle() 之前的代码）
│     └─ interceptor.intercept(context, next)
│     │
│     │   next.handle() 触发 ↓
│     │
│     ├─ ⑤ 管道 Pipes（对每个参数：提取原始值 → 依次应用管道 → 写入参数数组）
│     │     └─ pipe.transform(value, metadata)
│     │
│     └─ ⑥ 控制器方法 Controller Handler
│           └─ callback.apply(instance, args)
│
├─ ⑦ 拦截器后置逻辑（RxJS 流上对响应做 map/tap 等变换）
│
├─ ⑧ 响应处理（普通返回 / @Redirect / @Render / @Sse）
│
└─ ⑨ 异常过滤器 Exception Filters（①~⑧ 任何环节抛异常时接管）
      └─ filter.catch(exception, host)   ← 未命中自定义过滤器时走内置兜底 BaseExceptionFilter
```

> 记忆口诀：**中间件 → 守卫 → 拦截器（前置）→ 管道 → 控制器方法 → 拦截器（后置）→ 响应**；异常过滤器横跨全程兜底。

---

## 二、启动阶段：组件是如何被"编译"并注册的

理解调用时机的关键在于：**守卫 / 拦截器 / 管道 / 过滤器并不是请求到来时才收集的（静态作用域下），而是在启动阶段就被"编译"进一个闭包链，注册到底层路由器上。**

### 2.1 初始化总流程

入口：`NestApplication.init()` — `packages/core/nest-application.ts:244`

```
init()
├─ applyOptions()                          // CORS 等启动选项
├─ httpAdapter.init()                      // 初始化适配器
├─ registerParserMiddleware()              // ③ body-parser（内置中间件）
├─ registerModules()                       // ④ WebSocket / 微服务 / 用户中间件
│    └─ middlewareModule.register(...)     //    执行各模块 configure(builder)，收集+解析中间件
├─ registerRouter()                        // ⑤ 注册路由
│    ├─ registerMiddleware()               //    ⑤a 先把用户中间件挂到适配器（先于路由）
│    └─ routesResolver.resolve()           //    ⑤b 再遍历所有控制器注册路由
├─ callInitHook()                          // ⑥ onModuleInit
├─ registerRouterHooks()                   // ⑦ 404 兜底 + 全局异常兜底处理器
└─ callBootstrapHook()                     // ⑧ onApplicationBootstrap
```

### 2.2 路由注册：把组件"编织"进处理函数

调用链：

```
RoutesResolver.resolve()                    packages/core/router/routes-resolver.ts:85
└─ RouterExplorer.explore()                 packages/core/router/router-explorer.ts:140
   └─ applyPathsToRouterProxy()             packages/core/router/router-explorer.ts:188
      └─ applyCallbackToRouter()            packages/core/router/router-explorer.ts:221
         └─ createCallbackProxy()           packages/core/router/router-explorer.ts:459
            │
            ├─ executionContextCreator.create()   // ① 构建守卫/拦截器/管道执行链（见第三节）
            │
            ├─ exceptionsFilter.create()          // ② 构建异常过滤器链
            │    RouterExceptionFilters.create()  packages/core/router/router-exception-filters.ts:43
            │    ├─ createContext(...)            // 全局+类级+方法级过滤器（ContextCreator 模板）
            │    └─ exceptionHandler.setCustomFilters(filters.reverse())
            │
            └─ routerProxy.createProxy(executionContext, exceptionFilter)
                                                 // ③ 用 try/catch 把两者粘合
                                                 packages/core/router/router-proxy.ts:32
```

最终得到的处理函数被注册到底层适配器（`router.get(path, handler)` 等）。

### 2.3 组件收集的统一模板：ContextCreator

守卫 / 拦截器 / 管道 / 异常过滤器四套机制的实例收集共用同一个模板方法 ——
`ContextCreator.createContext()`：`packages/core/helpers/context-creator.ts:47`

```ts
// 合并顺序：全局 → 控制器类级 → 方法级（因此执行顺序也是如此）
const globalMetadata  = this.getGlobalMetadata(contextId, inquirerId);   // app.useGlobalXxx / APP_* 注入
const classMetadata   = this.reflectClassMetadata(instance, metadataKey);  // @UseXxx() 装饰在类上
const methodMetadata  = this.reflectMethodMetadata(callback, metadataKey); // @UseXxx() 装饰在方法上
return [...createConcreteContext(globalMetadata),
         ...createConcreteContext(classMetadata),
         ...createConcreteContext(methodMetadata)];
```

全局组件的注册入口：
- 对外 API：`NestApplication.useGlobalGuards/Pipes/Interceptors/Filters` — `packages/core/nest-application.ts:586-648`
- 底层存储：`ApplicationConfig.useGlobalGuards(...)` 等 — `packages/core/application-config.ts:118-212`
- 另外，以 `APP_GUARD / APP_PIPE / APP_INTERCEPTOR / APP_FILTER` token 注入的 provider 也会在容器初始化时被搬进全局列表（`packages/core/injector/container.ts` 的 `addScopedEnhancersMetadata`）。

---

## 三、运行时：每个组件的精确调用点

以下均围绕核心文件 **`packages/core/router/router-execution-context.ts`** 的 `create()` 方法（`:115`）展开。它在启动时为每个路由生成最终的 `async (req, res, next) => {...}` 处理函数：

```ts
// router-execution-context.ts:194-220（执行顺序即代码顺序）
return async (req, res, next) => {
  const args = this.contextUtils.createNullArray(argsLength);

  // ① 守卫：全部通过才继续；任一 false → 抛 ForbiddenException(403)
  fnCanActivate && (await fnCanActivate([req, res, next]));          // :202

  // ② 设置 @HttpCode 状态码与 @Header 自定义响应头
  this.responseController.setStatus(res, httpStatusCode);            // :205
  hasCustomHeaders && this.responseController.setHeaders(res, responseHeaders);

  // ③ 拦截器链：前置逻辑 → handler（内部含管道+控制器方法）→ 后置逻辑
  const result = await this.interceptorsConsumer.intercept(          // :210
    interceptors, [req, res, next], instance, callback,
    handler(args, req, res, next),   // ← 这个 handler 就是"管道 + 控制器方法"
    contextType,
  );

  // ④ 响应处理：序列化写回 / 重定向 / 渲染 / SSE
  await fnHandleResponse(result, res, req);                          // :219
};

// handler 定义（拦截器 next.handle() 触发后才执行）：router-execution-context.ts:181-191
const handler = (args, req, res, next) => async () => {
  fnApplyPipes && (await fnApplyPipes(args, req, res, next)); // 管道：提取参数+转换校验
  return callback.apply(instance, args);                      // 控制器方法本体
};
```

### 3.1 中间件 Middleware

| 环节 | 说明 |
|---|---|
| **调用时机** | 请求生命周期最前：由底层 HTTP 适配器（Express/Fastify）在路由处理器之前调用。Nest 的路由和中间件都注册在同一个底层路由器上，中间件先注册（`init()` 第 ⑤a 步），因此先执行 |
| **执行方法** | `NestMiddleware.use(req, res, next)` |
| **调用位置** | `packages/core/middleware/middleware-module.ts:398-410`（`createProxy`：`instance.use.bind(instance)` 后交给 RouterProxy 包装） |
| **注册编排** | `packages/core/middleware/middleware-module.ts:179`（`registerMiddleware`，按模块依赖距离排序挂载）；实例解析在 `middleware/resolver.ts` |
| **接口定义** | `packages/common/interfaces/middleware/nest-middleware.interface.ts` |
| **内置 body-parser** | `packages/core/adapters/*` 的 `registerParserMiddleware`（`init()` 第 ③ 步，`nest-application.ts:278`） |

注意：中间件**只能拿到原始 req/res**，不感知路由处理器与执行上下文；它的异常同样会被 RouterProxy 交给异常过滤器（`middleware-module.ts:409`）。

### 3.2 守卫 Guards

| 环节 | 说明 |
|---|---|
| **调用时机** | 中间件之后、拦截器/管道之前。唯一职责是鉴权决定"请求能否继续" |
| **触发代码** | `router-execution-context.ts:202` → `createGuardsFn`（`:468`）→ `GuardsConsumer.tryActivate` |
| **执行方法** | `CanActivate.canActivate(context)`，逐个顺序执行；任一返回 false → `ForbiddenException(403)`（`router-execution-context.ts:483`） |
| **执行器源码** | `packages/core/guards/guards-consumer.ts:27`（支持同步 boolean / Promise / Observable 三种返回） |
| **收集器源码** | `packages/core/guards/guards-context-creator.ts:39`（全局+类级+方法级，`GUARDS_METADATA`） |

### 3.3 拦截器 Interceptors

| 环节 | 说明 |
|---|---|
| **调用时机** | 守卫之后、管道之前。`next.handle()` 前的代码先于控制器执行，`handle()` 返回的 Observable 上的操作符（map/tap...）在控制器返回后作用于响应流 |
| **触发代码** | `router-execution-context.ts:210` → `InterceptorsConsumer.intercept` |
| **执行方法** | `NestInterceptor.intercept(context, next)`；用 RxJS `defer + mergeAll` 递归编织成链 |
| **执行器源码** | `packages/core/interceptors/interceptors-consumer.ts:33`（递归建链 `:51-61`；`transformDeferred` 惰性触发真正的 handler `:93`） |
| **收集器源码** | `packages/core/interceptors/interceptors-context-creator.ts`（`INTERCEPTORS_METADATA`） |
| **典型用途** | 响应转换/缓存/超时/日志（可同时拿到请求与响应） |

### 3.4 管道 Pipes

| 环节 | 说明 |
|---|---|
| **调用时机** | 拦截器前置逻辑之后、**控制器方法执行之前**（位于拦截器链尾的 handler 内部）。按参数逐个应用：`提取原始值 → 管道链 → 写入 args[index]` |
| **触发代码** | `router-execution-context.ts:189` → `createPipesFn`（`:496`）→ `getParamValue`（`:418`）→ `PipesConsumer.apply` |
| **可管道化的参数** | 仅 body / query / param / file 等数据类参数（`isPipeable`，`router-execution-context.ts:446`）；req/res/next 对象类参数不经过管道 |
| **执行方法** | `PipeTransform.transform(value, { metatype, type, data })`，用 `reduce` 串成异步链，前一个输出 = 后一个输入 |
| **执行器源码** | `packages/core/pipes/pipes-consumer.ts:25-55` |
| **收集器源码** | `packages/core/pipes/pipes-context-creator.ts`（方法级公共管道 `:39` + 参数级管道 `:377` 附近，`exchangeKeysForValues` 中每参数单独收集，`PIPES_METADATA`） |
| **内置管道** | `packages/common/pipes/`：`validation.pipe.ts`（ValidationPipe）、`parse-int/float/bool/uuid/enum/array/date.pipe.ts`、`default-value.pipe.ts` |

### 3.5 异常过滤器 Exception Filters

| 环节 | 说明 |
|---|---|
| **调用时机** | 横跨全程：中间件、守卫（403）、拦截器、管道（如 ValidationPipe 的 400）、控制器方法中任何一环抛出的异常，都会被 RouterProxy 的 try/catch 捕获后交给过滤器链 |
| **触发代码** | `packages/core/router/router-proxy.ts:41-51`：`catch (e) → new ExecutionContextHost([req,res,next]) → exceptionsHandler.next(e, host)` |
| **执行方法** | `filter.catch(exception, host)`。`ExceptionsHandler.next`（`packages/core/exceptions/exceptions-handler.ts:28`）先 `invokeCustomFilters`：用 `selectExceptionFilterMetadata`（`packages/common/utils/select-exception-filter-metadata.util.ts`）按 `@Catch()` 声明的异常类型选出**第一个**匹配的过滤器执行；未命中则回退 `BaseExceptionFilter.catch`（`packages/core/exceptions/base-exception-filter.ts:44`，内置兜底：HttpException → 状态码+json，其他 → 500） |
| **收集器源码** | `packages/core/router/router-exception-filters.ts:43`（`create`：全局+类级+方法级，`EXCEPTION_FILTERS_METADATA`；注意收集后 `filters.reverse()`——方法级最先匹配）；基类 `packages/core/exceptions/base-exception-filter-context.ts` |
| **两类兜底** | ① 路由未命中 404：`routes-resolver.ts:179` `registerNotFoundHandler`（抛 `NotFoundException("Cannot GET /xxx")`）；② 适配器层错误（如 body-parser JSON 语法错误）：`routes-resolver.ts:199` `registerExceptionHandler` + `mapExternalException`，由 `ExternalExceptionsHandler`（`packages/core/exceptions/external-exceptions-handler.ts` / `external-exception-filter-context.ts`）处理 |

### 3.6 请求作用域的特殊情况

若控制器是请求作用域（注入了 `REQUEST`），启动时不会预构建静态闭包，而是注册
`RouterExplorer.createRequestScopedHandler`（`router-explorer.ts:499`）：每次请求先按 `ContextId`
从容器加载该请求专属的控制器实例，再动态调用 `createCallbackProxy` 执行同样的链路；
守卫/拦截器/管道/过滤器也会在该上下文中重新解析（各 `getGlobalMetadata` 的 scoped 分支）。

---

## 四、源码位置速查表

| 组件 | 接口/装饰器定义（@nestjs/common） | 收集/编译（core） | 运行时执行（core） | 调用时机 |
|---|---|---|---|---|
| 中间件 | `packages/common/interfaces/middleware/` | `core/middleware/middleware-module.ts`（编排注册）、`middleware/resolver.ts`（实例解析）、`middleware/builder.ts`（`configure()` 构建器） | `middleware-module.ts:398` `createProxy` → `instance.use()` | 最先执行（路由前） |
| 守卫 | `CanActivate`；`@UseGuards`（`packages/common/decorators/core/use-guards.decorator.ts`） | `core/guards/guards-context-creator.ts` | `core/guards/guards-consumer.ts:27` `tryActivate` → `canActivate()` | 中间件后、拦截器前 |
| 拦截器 | `NestInterceptor` / `CallHandler`；`@UseInterceptors` | `core/interceptors/interceptors-context-creator.ts` | `core/interceptors/interceptors-consumer.ts:33` `intercept` → `intercept()` | 守卫后、管道前（前置）；响应返回前（后置） |
| 管道 | `PipeTransform`、`ArgumentMetadata`；`@UsePipes`；内置管道 `packages/common/pipes/` | `core/pipes/pipes-context-creator.ts`、`core/pipes/params-token-factory.ts` | `core/pipes/pipes-consumer.ts:25-55` `apply/applyPipes` → `transform()` | 控制器方法前（拦截器链尾） |
| 异常过滤器 | `ExceptionFilter`；`@Catch`；`@UseFilters` | `core/router/router-exception-filters.ts`、`core/exceptions/base-exception-filter-context.ts` | `core/router/router-proxy.ts:44` catch → `core/exceptions/exceptions-handler.ts:28` `next/invokeCustomFilters` → `catch()`；兜底 `core/exceptions/base-exception-filter.ts:44` | 任何环节抛异常时 |

**贯穿性的核心文件**（值得按序精读）：

1. `packages/core/nest-application.ts` — 启动编排（`init()` :244）
2. `packages/core/router/routes-resolver.ts` — 路由注册总入口
3. `packages/core/router/router-explorer.ts` — `createCallbackProxy` :459（织入全部组件）
4. `packages/core/router/router-execution-context.ts` — **运行时执行顺序的权威出处**（:194-220）
5. `packages/core/router/router-proxy.ts` — 异常过滤器接入点
6. `packages/core/helpers/context-creator.ts` — 全局/类/方法三级收集模板
7. `packages/core/application-config.ts` — 全局组件存储（:118-212）

---

## 五、一图流：从启动到请求的完整链路

```
【启动/编译期】
NestApplication.init()
  ├─ MiddlewareModule.register()          → 收集 configure() 中的中间件 → 解析实例
  ├─ MiddlewareModule.registerMiddleware() → use() 经 RouterProxy 包装 → 挂到适配器   ┐
  └─ RoutesResolver.resolve()                                                                  │ 注册到
       └─ RouterExplorer.explore()                                                              │ Express/
            └─ createCallbackProxy()                                                            │ Fastify
                 ├─ RouterExecutionContext.create()   → 守卫/拦截器/管道闭包链        │
                 ├─ RouterExceptionFilters.create()   → ExceptionsHandler(过滤器链)   │
                 └─ RouterProxy.createProxy()         → try/catch 粘合 ──────────────┘

【运行期：每个请求】
适配器命中路由
  → [Middleware] use()                       ← 先注册先执行
  → RouterProxy 包装的 handler
      → [Guard] canActivate()                ← false 则 403
      → setStatus / setHeaders
      → [Interceptor 前置] intercept()
          → next.handle()
              → [Pipe] transform()           ← 逐参数转换/校验，失败抛异常
              → [Controller] handler()
          → [Interceptor 后置] RxJS 流变换
      → fnHandleResponse()                   → 写回响应
  → catch → [ExceptionFilter] catch()        ← 任何一步抛异常都到这里
```
