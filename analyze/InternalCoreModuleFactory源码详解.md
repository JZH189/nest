# InternalCoreModuleFactory 源码详解

> 文档版本：1.0
> 生成时间：2026-05-15
> 代码位置：`packages/core/injector/internal-core-module/internal-core-module-factory.ts`

---

## 一、整体定位

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        应用启动流程                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  NestFactory.create()                                                       │
│         ↓                                                                  │
│  DependenciesScanner.scan()                                                 │
│         ↓                                                                  │
│  registerCoreModule()  ←─── 入口                                           │
│         ↓                                                                  │
│  InternalCoreModuleFactory.create()  ←─── 我们要分析的                      │
│         ↓                                                                  │
│  InternalCoreModule.register()                                              │
│         ↓                                                                  │
│  框架内部的核心服务被注册到全局                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、核心职责

**一句话总结**：为 NestJS 框架创建"内部隐藏模块"，将框架级别的核心服务注册到依赖注入容器中。

---

## 三、源码完整解析

### 3.1 类结构

```typescript
export class InternalCoreModuleFactory {
  static create(
    container: NestContainer,           // 依赖注入容器
    scanner: DependenciesScanner,        // 依赖扫描器
    moduleCompiler: ModuleCompiler,     // 模块编译器
    httpAdapterHost: HttpAdapterHost,  // HTTP 适配器主机
    graphInspector: GraphInspector,    // 依赖图检查器
    moduleOverrides?: ModuleOverride[],  // 模块覆盖配置
  ) { ... }
}
```

### 3.2 参数详解

| 参数 | 类型 | 作用 |
|------|------|------|
| `container` | `NestContainer` | 依赖注入容器，存储所有模块实例 |
| `scanner` | `DependenciesScanner` | 用于懒加载时扫描模块 |
| `moduleCompiler` | `ModuleCompiler` | 用于编译动态模块 |
| `httpAdapterHost` | `HttpAdapterHost` | 提供 Express/Fastify 的访问 |
| `graphInspector` | `GraphInspector` | 用于快照模式验证依赖图 |
| `moduleOverrides` | `ModuleOverride[]` | 模块覆盖配置 |

---

## 四、创建的提供者

```typescript
return InternalCoreModule.register([
  // 1. ExternalContextCreator - 外部上下文创建器
  {
    provide: ExternalContextCreator,
    useFactory: () => ExternalContextCreator.fromContainer(container),
  },
  
  // 2. ModulesContainer - 模块容器
  {
    provide: ModulesContainer,
    useFactory: () => container.getModules(),
  },
  
  // 3. HttpAdapterHost - HTTP 适配器主机
  {
    provide: HttpAdapterHost,
    useFactory: () => httpAdapterHost,
  },
  
  // 4. LazyModuleLoader - 懒加载模块加载器
  {
    provide: LazyModuleLoader,
    useFactory: lazyModuleLoaderFactory,
  },
  
  // 5. SerializedGraph - 依赖关系图
  {
    provide: SerializedGraph,
    useFactory: () => container.serializedGraph,
  },
]);
```

---

## 五、每个提供者的详细作用

### 5.1 ExternalContextCreator

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ExternalContextCreator                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用途: 为 @UseGuards、@UsePipes、@UseInterceptors、@UseFilters 装饰器        │
│       创建执行上下文                                                          │
│                                                                             │
│  源码:                                                                      │
│  ```typescript                                                             │
│  ExternalContextCreator.fromContainer(container)                            │
│  ```                                                                        │
│                                                                             │
│  使用示例:                                                                  │
│  ```typescript                                                             │
│  @Injectable()                                                             │
│  class AuthGuard implements CanActivate {                                    │
│    constructor(private reflector: Reflector) {}                              │
│                                                                             │
│    canActivate(context: ExecutionContext): boolean {                        │
│      // context 由 ExternalContextCreator 创建                               │
│      // 包含 request、response、next 等对象                                  │
│    }                                                                        │
│  }                                                                          │
│  ```                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 ModulesContainer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ModulesContainer                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用途: 存储所有模块实例的容器，支持运行时访问                                 │
│                                                                             │
│  继承关系: ModulesContainer extends Map<string, Module>                      │
│                                                                             │
│  使用示例:                                                                  │
│  ```typescript                                                             │
│  @Injectable()                                                             │
│  class ModuleRegistry {                                                     │
│    constructor(private modules: ModulesContainer) {}                        │
│                                                                             │
│    getAllModules() {                                                       │
│      return [...this.modules.values()];                                     │
│    }                                                                        │
│                                                                             │
│    getModuleById(id: string) {                                             │
│      return this.modules.get(id);                                          │
│    }                                                                        │
│                                                                             │
│    getModulesCount() {                                                     │
│      return this.modules.size;                                             │
│    }                                                                        │
│  }                                                                          │
│  ```                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 HttpAdapterHost

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             HttpAdapterHost                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用途: 提供对底层 HTTP 服务器（Express/Fastify）的访问                       │
│                                                                             │
│  源码:                                                                      │
│  ```typescript                                                             │
│  export class HttpAdapterHost {                                             │
│    constructor(public httpAdapter: AbstractHttpAdapter) {}                  │
│  }                                                                          │
│  ```                                                                        │
│                                                                             │
│  使用示例:                                                                  │
│  ```typescript                                                             │
│  @Injectable()                                                             │
│  class CorsConfig {                                                        │
│    constructor(private adapterHost: HttpAdapterHost) {}                     │
│                                                                             │
│    enableCors(app: INestApplication) {                                      │
│      // 通过适配器访问底层 Express/Fastify                                  │
│      this.adapterHost.httpAdapter.enableCors({                              │
│        origin: '*',                                                         │
│        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',                           │
│      });                                                                   │
│    }                                                                        │
│  }                                                                          │
│  ```                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 LazyModuleLoader

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LazyModuleLoader                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用途: 支持运行时动态加载模块                                                │
│                                                                             │
│  适用场景:                                                                  │
│  • 延迟加载大型模块                                                        │
│  • 条件加载模块                                                            │
│  • 插件式架构                                                              │
│                                                                             │
│  内部创建:                                                                  │
│  ```typescript                                                             │
│  const lazyModuleLoaderFactory = () => {                                    │
│    const injector = new Injector({...});  // 新的注入器                     │
│    const instanceLoader = new InstanceLoader(...); // 新的实例加载器         │
│    return new LazyModuleLoader(scanner, instanceLoader, ...);              │
│  };                                                                        │
│  ```                                                                        │
│                                                                             │
│  使用示例:                                                                  │
│  ```typescript                                                             │
│  @Injectable()                                                             │
│  class FeatureService {                                                     │
│    constructor(private lazyModuleLoader: LazyModuleLoader) {}                │
│                                                                             │
│    async loadFeature() {                                                   │
│      // 运行时动态加载模块                                                  │
│      const module = await this.lazyModuleLoader.load(FeatureModule);       │
│    }                                                                        │
│  }                                                                          │
│  ```                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 SerializedGraph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             SerializedGraph                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用途: 存储依赖关系图，用于快照模式和序列化验证                              │
│                                                                             │
│  使用场景:                                                                  │
│  • app.enableSnapshot()  // 启用快照模式                                   │
│  • 依赖关系验证                                                            │
│  • 应用状态序列化                                                          │
│                                                                             │
│  使用示例:                                                                  │
│  ```typescript                                                             │
│  const app = await NestFactory.create(AppModule, {                        │
│    snapshot: true,                                                         │
│  });                                                                       │
│                                                                             │
│  // 获取依赖关系图                                                          │
│  const graph = app.get(SerializedGraph);                                    │
│  console.log(graph.nodes);  // 所有节点                                     │
│  console.log(graph.edges);  // 所有边                                       │
│  ```                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 六、完整架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  InternalCoreModuleFactory 完整架构                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  NestFactory.create()                                                       │
│         ↓                                                                  │
│  DependenciesScanner.scan()                                                 │
│         ↓                                                                  │
│  registerCoreModule()                                                       │
│         ↓                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │              InternalCoreModuleFactory.create()                         │ │
│  │                                                                     │ │
│  │  输入:                                                               │ │
│  │  ├── container           (依赖注入容器)                               │ │
│  │  ├── scanner             (依赖扫描器)                                 │ │
│  │  ├── moduleCompiler     (模块编译器)                                 │ │
│  │  ├── httpAdapterHost    (HTTP 适配器主机)                            │ │
│  │  └── graphInspector     (依赖图检查器)                               │ │
│  │                                                                     │ │
│  │  过程:                                                               │ │
│  │  1. lazyModuleLoaderFactory()                                        │ │
│  │     └── 创建新的 Injector + InstanceLoader                           │ │
│  │                                                                     │ │
│  │  2. InternalCoreModule.register([...])                              │ │
│  │     └── 注册 5 个框架核心提供者                                       │ │
│  │                                                                     │ │
│  │  输出:                                                               │ │
│  │  └── DynamicModule                                                   │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         ↓                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                  InternalCoreModule (@Global)                        │ │
│  │                                                                     │ │
│  │  ┌───────────────────────────────────────────────────────────────┐  │ │
│  │  │  直接提供 (providers)        │  导出 (exports)                │  │ │
│  │  ├───────────────────────────────────────────────────────────────┤  │ │
│  │  │  • Reflector                  │  • Reflector                   │  │ │
│  │  │  • ReflectorAliasProvider     │  • ReflectorAliasProvider       │  │ │
│  │  │  • requestProvider            │  • requestProvider              │  │ │
│  │  │  • inquirerProvider           │  • inquirerProvider             │  │ │
│  │  │  • ExternalContextCreator ←── │  • ExternalContextCreator       │  │ │
│  │  │  • ModulesContainer      ←───│  • ModulesContainer             │  │ │
│  │  │  • HttpAdapterHost      ←────│  • HttpAdapterHost              │  │ │
│  │  │  • LazyModuleLoader     ←────│  • LazyModuleLoader             │  │ │
│  │  │  • SerializedGraph      ←────│  • SerializedGraph             │  │ │
│  │  └───────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         ↓                                                                  │
│  所有模块可无感注入这些服务                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 七、@Global() 的作用

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           @Global() 的作用                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  普通模块 vs 全局模块:                                                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                        普通模块                                      │     │
│  │                                                                 │     │
│  │  @Module({                                                     │     │
│  │    providers: [UserService],                                    │     │
│  │    exports: [UserService],                                       │     │
│  │  })                                                              │     │
│  │  export class UserModule {}                                       │     │
│  │                                                                 │     │
│  │  效果: UserService 只能在 UserModule 内部使用                      │     │
│  │       其他模块必须通过 imports 导入才能使用                         │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│                           ↓                                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                       @Global() 模块                              │     │
│  │                                                                 │     │
│  │  @Global()                                                      │     │
│  │  @Module({                                                     │     │
│  │    providers: [Reflector, ...],                                 │     │
│  │    exports: [Reflector, ...],                                   │     │
│  │  })                                                              │     │
│  │  export class InternalCoreModule {}                              │     │
│  │                                                                 │     │
│  │  效果: 所有提供者自动"注入"到所有模块                               │     │
│  │       无需显式 import，任意模块可直接注入                          │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                        依赖关系                                    │     │
│  │                                                                 │     │
│  │  ┌─────────────────┐                                             │     │
│  │  │ InternalCoreModule │ (@Global 自动导入到所有模块)              │     │
│  │  └────────┬────────┘                                             │     │
│  │           │                                                      │     │
│  │           ├──► Module A  ──► 可注入 Reflector                    │     │
│  │           ├──► Module B  ──► 可注入 ModulesContainer              │     │
│  │           └──► Module C  ──► 可注入 LazyModuleLoader              │     │
│  │                                                                 │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 八、InternalCoreModule 完整源码

```typescript
// internal-core-module.ts

const ReflectorAliasProvider = {
  provide: Reflector.name,      // 'Reflector'
  useExisting: Reflector,        // 使用已有的 Reflector
};

@Global()                        // 标记为全局模块
@Module({
  // 框架直接提供的提供者
  providers: [
    Reflector,                    // 反射服务
    ReflectorAliasProvider,       // Reflector 别名
    requestProvider,             // 请求作用域
    inquirerProvider,            // 询问者作用域
  ],
  // 导出所有提供者
  exports: [
    Reflector,
    ReflectorAliasProvider,
    requestProvider,
    inquirerProvider,
  ],
})
export class InternalCoreModule {
  static register(
    providers: Array<ValueProvider | FactoryProvider | ExistingProvider>,
  ): DynamicModule {
    return {
      module: InternalCoreModule,
      providers: [...providers],           // 添加 factory 创建的提供者
      exports: [...providers.map(item => item.provide)],  // 导出 factory 创建的提供者
    };
  }
}
```

---

## 九、实际使用示例

### 9.1 注入 Reflector（最常用）

```typescript
import { Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const ROUTES_KEY = 'routes';

// 使用 Reflector 获取元数据
@Injectable()
class RouteRegistry {
  constructor(private reflector: Reflector) {}
  
  getPublicRoutes() {
    // 获取所有标记为 public 的路由
    return this.reflector.getAll<string[]>(ROUTES_KEY, [
      this.reflector.get<string[]>('public'),
    ]);
  }
}
```

### 9.2 注入 ModulesContainer

```typescript
import { Injectable } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';

@Injectable()
class ModuleInfoService {
  constructor(private modules: ModulesContainer) {}
  
  getAllModules() {
    return [...this.modules.values()].map(m => ({
      name: m.metatype?.name,
      providersCount: m.providers.size,
      controllersCount: m.controllers.size,
    }));
  }
  
  findModule(moduleName: string) {
    return [...this.modules.values()].find(
      m => m.metatype?.name === moduleName
    );
  }
}
```

### 9.3 注入 LazyModuleLoader

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';

@Injectable()
class DynamicFeatureLoader implements OnModuleInit {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}
  
  async onModuleInit() {
    // 延迟加载重型模块
    const { HeavyModule } = await import('./heavy/heavy.module');
    const moduleRef = await this.lazyModuleLoader.load(HeavyModule);
    console.log('HeavyModule loaded:', moduleRef);
  }
}
```

### 9.4 注入 HttpAdapterHost

```typescript
import { Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Injectable()
class MiddlewareInstaller {
  constructor(private adapterHost: HttpAdapterHost) {}
  
  installCustomMiddleware() {
    const adapter = this.adapterHost.httpAdapter;
    
    // 访问底层 Express 实例
    adapter.getInstance().use((req, res, next) => {
      console.log('Custom middleware:', req.url);
      next();
    });
  }
}
```

---

## 十、一句话总结

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   InternalCoreModuleFactory 的作用                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  将 NestJS 框架内部的 9 个核心服务注册为"全局提供者"：                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  来源                   │  提供者                     │  用途           │ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │  框架直接提供            │  Reflector                 │  反射元数据     │ │
│  │                         │  requestProvider           │  请求上下文      │ │
│  │                         │  inquirerProvider          │  询问者上下文    │ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │  Factory 创建            │  ExternalContextCreator    │  装饰器上下文    │ │
│  │                         │  ModulesContainer          │  模块容器访问    │ │
│  │                         │  HttpAdapterHost           │  HTTP 适配器     │ │
│  │                         │  LazyModuleLoader          │  懒加载模块      │ │
│  │                         │  SerializedGraph          │  依赖图序列化    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  效果：用户可以在任何模块中直接注入这些服务，无需显式 import                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 十一、相关文件列表

| 文件 | 作用 |
|------|------|
| `internal-core-module-factory.ts` | 工厂类，创建 InternalCoreModule |
| `internal-core-module.ts` | 框架内部核心模块定义 |
| `external-context-creator.ts` | 外部上下文创建器 |
| `modules-container.ts` | 模块容器 |
| `http-adapter-host.ts` | HTTP 适配器主机 |
| `lazy-module-loader.ts` | 懒加载模块加载器 |
| `serialized-graph.ts` | 依赖关系图 |
| `reflector.ts` | 反射服务 |

---

*文档由 AI 辅助生成，如有错误欢迎指正。*
