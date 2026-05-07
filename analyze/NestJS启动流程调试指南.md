# NestJS 启动流程调试指南

> 生成时间：2026-05-05

---

## 一、启动流程概览

NestJS 启动流程主要分为两个阶段：

```
┌─────────────────────────────────────────────────────────────────┐
│                     第一阶段：NestFactory.create()               │
│                   (初始化容器 + 依赖注入)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. NestFactory.create()  ←── 入口点                            │
│         ↓                                                       │
│  2. 创建 NestContainer (依赖注入容器)                            │
│         ↓                                                       │
│  3. 创建 DependenciesScanner (依赖扫描器)                        │
│         ↓                                                       │
│  4. dependenciesScanner.scan()  ←── 扫描模块                     │
│         ↓                                                       │
│  5. instanceLoader.createInstancesOfDependencies()  ←── 实例化    │
│         ↓                                                       │
│  6. applyApplicationProviders()  ←── 应用全局提供者              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    第二阶段：NestApplication.init()              │
│                      (HTTP 服务器 + 路由)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  7. NestApplication.init()  ←── 应用初始化                      │
│         ↓                                                       │
│  8. registerParserMiddleware()  ←── 注册 body-parser            │
│         ↓                                                       │
│  9. registerModules()  ←── 注册中间件、WebSocket、微服务         │
│         ↓                                                       │
│ 10. registerRouter()  ←── 路由解析                              │
│         ↓                                                       │
│ 11. registerRouterHooks()  ←── 注册 404/异常处理器               │
│         ↓                                                       │
│ 12. callBootstrapHook()  ←── 调用 OnApplicationBootstrap       │
│         ↓                                                       │
│ 13. app.listen()  ←── 启动 HTTP 服务器                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、关键文件入口

### 2.1 入口文件清单

| 文件路径 | 作用 | 关键方法 |
|---------|------|----------|
| `packages/core/nest-factory.ts` | 工厂类，创建应用实例 | `create()`, `createMicroservice()` |
| `packages/core/nest-application.ts` | 应用主体，管理生命周期 | `init()`, `listen()` |
| `packages/core/scanner.ts` | 依赖扫描器，扫描模块和装饰器 | `scan()`, `scanForModules()` |
| `packages/core/injector/container.ts` | 依赖注入容器 | `addModule()`, `getModules()` |
| `packages/core/injector/injector.ts` | 注入器，实例化服务 | `loadProvider()`, `loadController()` |
| `packages/core/injector/instance-loader.ts` | 实例加载器 | `createInstancesOfDependencies()` |
| `packages/core/router/routes-resolver.ts` | 路由解析器 | `resolve()`, `registerRouters()` |
| `packages/core/router/router-explorer.ts` | 路由探索器 | `explore()`, `extractRouterPath()` |

---

## 三、调试断点设置

### 3.1 推荐的断点位置 (按启动顺序)

```
nest-factory.ts
├── create() 方法 (第 84-118 行)  ←── 起点
│   ├── 第 93 行: new ApplicationConfig()
│   ├── 第 94 行: new NestContainer()
│   ├── 第 100-107 行: initialize()  ←── 关键
│   │   ├── 第 228 行: new DependenciesScanner()
│   │   ├── 第 243 行: dependenciesScanner.scan()
│   │   │   ├── registerCoreModule() (scanner.ts:609)
│   │   │   ├── scanForModules() (scanner.ts:106)  ←── 递归扫描模块
│   │   │   ├── scanModulesForDependencies() (scanner.ts:202)
│   │   │   ├── addScopedEnhancersMetadata() (scanner.ts:629)
│   │   │   └── applyApplicationProviders() (scanner.ts:651)
│   │   └── 第 244 行: instanceLoader.createInstancesOfDependencies()
│   │       ├── createPrototypes() (instance-loader.ts:40)
│   │       └── createInstances() (instance-loader.ts:48)  ←── 实例化
│   └── 第 109 行: new NestApplication()
│
nest-application.ts
├── init() 方法 (第 176-197 行)  ←── HTTP 初始化起点
│   ├── 第 181 行: applyOptions()
│   ├── 第 186 行: registerParserMiddleware()
│   ├── 第 188 行: registerModules()
│   │   ├── registerWsModule() (第 163 行)
│   │   ├── microserviceModule.register() (第 142 行)
│   │   └── middlewareModule.register() (第 152 行)
│   ├── 第 189 行: registerRouter()  ←── 路由注册
│   │   └── routesResolver.resolve() → RoutesResolver.resolve()
│   │       └── registerRouters() (第 88 行) → routerExplorer.explore()
│   └── 第 192 行: registerRouterHooks()
│       ├── registerNotFoundHandler() (第 146 行)
│       └── registerExceptionHandler() (第 162 行)
│
└── listen() 方法 (第 293-340 行)  ←── 启动 HTTP 服务器
```

### 3.2 依赖注入相关断点

```
injector.ts (packages/core/injector/injector.ts)
├── loadProvider() (约第 200-280 行)  ←── 加载 Provider
├── loadController() (约第 280-350 行)  ←── 加载 Controller
├── loadInjectable() (约第 350-400 行)  ←── 加载 Injectable
├── resolveConstructorParams() (约第 400-500 行)  ←── 解析构造函数参数
└── instantiateClass() (约第 500-550 行)  ←── 实例化类

scanner.ts (packages/core/scanner.ts)
├── scan() (第 86-104 行)  ←── 扫描入口
├── scanForModules() (第 106-175 行)  ←── 递归扫描模块
├── scanModulesForDependencies() (第 202-211 行)  ←── 扫描模块依赖
├── reflectProviders() (第 230-242 行)  ←── 反射 Providers
└── reflectControllers() (第 244-256 行)  ←── 反射 Controllers
```

---

## 四、调试配置

### 4.1 启动一个集成测试进行调试

推荐调试 `integration/hello-world` 测试，它是一个完整的 NestJS 应用：

1. **打开文件**: `integration/hello-world/e2e/hello-world.spec.ts`
2. **选择调试配置**: "Debug Current Test File"
3. **设置断点**在以下位置：
   - `nest-factory.ts` 的 `create()` 方法
   - `scanner.ts` 的 `scan()` 方法
   - `instance-loader.ts` 的 `createInstancesOfDependencies()`

### 4.2 自定义调试脚本

创建一个测试脚本 `debug-bootstrap.ts`：

```typescript
// debug-bootstrap.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './integration/hello-world/src/app.module';

async function bootstrap() {
  console.log('=== 1. 开始创建应用 ===');
  
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  
  console.log('=== 2. 应用已创建 ===');
  console.log('=== 3. 开始监听端口 ===');
  
  await app.listen(3000);
  console.log('=== 4. 应用已启动 ===');
}

bootstrap();
```

---

## 五、日志输出分析

### 5.1 启动时的日志顺序

```
[NestFactory] Nest application started
    ↓
[InstanceLoader] Instance of AppModule
    ↓
[RoutesResolver] Mapped {/hello, GET}
[Mapped {/host, GET}]
[Mapped {/host-array, GET}]
    ↓
[NestApplication] Nest application successfully started
```

### 5.2 开启详细日志

```typescript
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log', 'debug', 'verbose'],
});
```

---

## 六、核心流程详解

### 6.1 模块扫描流程 (scanner.scan)

```
1. registerCoreModule()
   └── 注册内部核心模块 (包含 Reflector 等)

2. scanForModules(rootModule)
   ├── insertOrOverrideModule() - 插入或覆盖模块
   ├── 递归处理 imports - 深度优先遍历
   └── 返回所有扫描到的模块

3. scanModulesForDependencies()
   ├── reflectImports() - 处理 imports
   ├── reflectProviders() - 处理 providers
   ├── reflectControllers() - 处理 controllers
   └── reflectExports() - 处理 exports

4. addScopedEnhancersMetadata()
   └── 为 scoped providers 添加增强器元数据

5. calculateModulesDistance()
   └── 计算模块间的距离（用于优化）

6. applyApplicationProviders()
   └── 应用 @APP_GUARD, @APP_PIPE 等全局提供者
```

### 6.2 实例化流程 (instance-loader)

```
1. createPrototypes(modules)
   └── 为所有 providers 创建原型（不实例化）

2. createInstances(modules)
   ├── createInstancesOfProviders()
   │   └── injector.loadProvider() - 实例化每个 provider
   ├── createInstancesOfControllers()
   │   └── injector.loadController() - 实例化每个 controller
   └── createInstancesOfInjectables()
       └── injector.loadInjectable() - 实例化每个 injectable
```

### 6.3 路由注册流程 (routes-resolver)

```
1. resolve(applicationRef, globalPrefix)
   └── 遍历所有模块

2. registerRouters(controllers, moduleName, ...)
   ├── 遍历所有 controller
   ├── extractRouterPath() - 提取路由路径
   └── explore() - 注册路由到 HTTP 适配器

3. registerNotFoundHandler()
   └── 设置 404 处理器

4. registerExceptionHandler()
   └── 设置全局异常处理器
```

### 6.4 HTTP 适配器创建流程 (createHttpAdapter)

这段代码位于 `nest-factory.ts` 第 318-325 行，是 NestJS 创建 HTTP 适配器的核心逻辑：

```typescript
// nest-factory.ts:318-325
private createHttpAdapter<T = any>(httpServer?: T): AbstractHttpAdapter {
  const { ExpressAdapter } = loadAdapter(
    '@nestjs/platform-express',
    'HTTP',
    () => require('@nestjs/platform-express'),
  );
  return new ExpressAdapter(httpServer);
}
```

#### 1. 为什么需要 HTTP 适配器？

NestJS 是一个**平台无关**的框架，它不直接绑定到 Express 或 Fastify，而是通过抽象的适配器模式来实现。这种设计带来了两个关键优势：

```
┌─────────────────────────────────────────────────────────────┐
│                      NestJS 核心                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              AbstractHttpAdapter                     │    │
│  │         (抽象 HTTP 适配器接口)                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                            ↑                                  │
│              ┌─────────────┴─────────────┐                   │
│              ↓                           ↓                   │
│  ┌───────────────────────┐   ┌───────────────────────┐      │
│  │   ExpressAdapter      │   │   FastifyAdapter      │      │
│  │ (@nestjs/platform-express) │ │ (@nestjs/platform-fastify) │
│  └───────────────────────┘   └───────────────────────┘      │
│              ↓                           ↓                   │
│         Express.js                 Fastify                   │
└─────────────────────────────────────────────────────────────┘
```

#### 2. `loadAdapter` 函数详解

`loadAdapter` 定义在 `packages/core/helpers/load-adapter.ts`：

```typescript
// load-adapter.ts:11-22
export function loadAdapter(
  defaultPlatform: string,    // 包名，如 '@nestjs/platform-express'
  transport: string,          // 传输类型，如 'HTTP'
  loaderFn?: Function,        // 可选的加载函数
) {
  try {
    // 优先使用传入的 loaderFn，否则直接 require
    return loaderFn ? loaderFn() : require(defaultPlatform);
  } catch (e) {
    // 如果加载失败，输出错误并退出进程
    logger.error(MISSING_REQUIRED_DEPENDENCY(defaultPlatform, transport));
    process.exit(1);
  }
}
```

#### 3. 参数解析

| 参数 | 值 | 含义 |
|------|-----|------|
| `defaultPlatform` | `'@nestjs/platform-express'` | 默认的 HTTP 平台包 |
| `transport` | `'HTTP'` | 传输类型标识，用于错误消息 |
| `loaderFn` | `() => require('@nestjs/platform-express')` | 动态加载函数 |

#### 4. 执行流程图

```
NestFactory.create()
    │
    ├─► isHttpServer(serverOrOptions)?
    │       │
    │       ├─► 是: 使用传入的 httpAdapter
    │       │
    │       └─► 否: 调用 createHttpAdapter()
    │               │
    │               ├─► loadAdapter('@nestjs/platform-express', 'HTTP')
    │               │       │
    │               │       ├─► require('@nestjs/platform-express')
    │               │       │
    │               │       ├─► 成功: 返回 { ExpressAdapter }
    │               │       │
    │               │       └─► 失败: 输出错误并 exit(1)
    │               │
    │               └─► new ExpressAdapter(httpServer)
    │
    └─► 返回配置好的适配器实例
```

#### 5. 懒加载机制

这段代码采用了**懒加载**模式：

```typescript
// 这里的 () => require(...) 是一个延迟执行的函数
// 只有在调用 loadAdapter 时才会真正执行 require
const { ExpressAdapter } = loadAdapter(
  '@nestjs/platform-express',
  'HTTP',
  () => require('@nestjs/platform-express'),  // 箭头函数，延迟加载
);
```

**好处**：
- 如果用户不使用某个平台（如只用微服务），就不需要加载对应的包
- 减少应用启动时的内存占用
- 支持 Tree-shaking 优化

#### 6. 错误处理

当 `@nestjs/platform-express` 包未安装时：

```
错误消息示例：
[Nest] 12345 - 2026/05/07 00:08:31 ERROR [PackageLoader] 
No driver (@nestjs/platform-express) has been selected. 
In order to take advantage of the default driver, please, 
ensure to install the "@nestjs/platform-express" package 
($ npm install @nestjs/platform-express).
```

#### 7. 如何切换到其他平台

如果想使用 Fastify 而不是 Express：

```typescript
import { FastifyAdapter } from '@nestjs/platform-fastify';

// 方式一：手动传入适配器
const app = await NestFactory.create(
  AppModule,
  new FastifyAdapter(),
);

// 方式二：安装 @nestjs/platform-fastify 并自动使用
// npm install @nestjs/platform-fastify
```

---

## 七、调试技巧

### 7.1 观察依赖注入

在 `injector.ts` 的 `resolveConstructorParams` 方法中加断点，可以观察到：
- 每个类的构造函数参数
- 参数的依赖是如何被解析的
- 循环依赖的情况

### 7.2 观察模块关系

在 `scanner.ts` 的 `scanModulesForDependencies` 中加断点，可以看到：
- 模块之间的导入关系
- Provider 和 Controller 的注册过程

### 7.3 观察路由绑定

在 `routes-resolver.ts` 的 `registerRouters` 中加断点，可以看到：
- 每个 Controller 对应的路由路径
- 路由是如何绑定到 Express/Fastify 的

### 7.4 常用调试命令

```bash
# 启动并观察日志
npm run start:dev 2>&1 | head -100

# 运行单个测试
npm test -- --grep "hello-world"

# 带调试运行
node --inspect-brk node_modules/.bin/mocha ...
```

---

## 八、推荐学习路径

### 第一步：理解入口
1. 在 `nest-factory.ts:create()` 设置断点
2. 按 F11 进入，逐步观察

### 第二步：理解模块扫描
1. 在 `scanner.ts:scan()` 设置断点
2. 观察模块是如何被递归扫描的

### 第三步：理解依赖注入
1. 在 `injector.ts:loadProvider()` 设置断点
2. 观察 Provider 是如何被实例化的

### 第四步：理解路由注册
1. 在 `routes-resolver.ts:registerRouters()` 设置断点
2. 观察路由是如何绑定到 HTTP 服务器的

### 第五步：理解请求处理
1. 在 `router-explorer.ts` 中设置断点
2. 发送一个 HTTP 请求，观察完整的请求处理流程

---

## 九、相关资源

- [NestJS 官方文档](https://docs.nestjs.com)
- [源码阅读指南](./源码学习计划.md)
- [项目结构分析](./项目结构分析报告.md)
