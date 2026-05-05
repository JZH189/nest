# NestJS 源码调试指南

> 通过 01-cats-app 项目调试 NestJS 源码

---

## 配置说明

### 1. tsconfig.json 路径映射

已配置路径映射，将 `@nestjs/*` 指向根目录的 `packages/` 源码：

```json
{
  "paths": {
    "@nestjs/common": ["../../packages/common"],
    "@nestjs/core": ["../../packages/core"],
    "@nestjs/microservices": ["../../packages/microservices"],
    "@nestjs/platform-express": ["../../packages/platform-express"],
    "@nestjs/testing": ["../../packages/testing"],
    "@nestjs/websockets": ["../../packages/websockets"],
    // ...
  }
}
```

### 2. launch.json 调试配置

| 配置名称 | 用途 |
|---------|------|
| **Debug NestJS 源码 (ts-node + paths)** | 使用 ts-node 直接运行并调试 |
| **Debug NestJS 源码 (内置调试器)** | 使用 Node.js 内置调试器 |
| **Debug NestJS 单元测试** | 调试单元测试文件 |
| **Debug NestJS 编译后代码** | 调试编译后的 JS 文件 |

---

## 调试步骤

### 步骤 1：打开调试视图

1. 按 `F5` 或点击 VSCode 左侧的 **运行和调试** 图标

### 步骤 2：选择调试配置

选择 **`Debug NestJS 源码 (ts-node + paths)`**

### 步骤 3：设置断点

在以下文件中设置断点：

```
根目录 /packages/core/nest-factory.ts
├── create() [第 84 行]
│   ├── initialize() [第 206 行]
│   └── 第 94 行: new NestContainer()

根目录 /packages/core/scanner.ts
├── scan() [第 86 行]
│   ├── scanForModules() [第 106 行]
│   └── scanModulesForDependencies() [第 202 行]

根目录 /packages/core/injector/instance-loader.ts
├── createInstancesOfDependencies() [第 25 行]
│   └── createInstances() [第 48 行]

根目录 /packages/core/nest-application.ts
├── init() [第 176 行]
│   ├── registerRouter() [第 189 行]
│   └── registerMiddleware() [第 152 行]
```

### 步骤 4：开始调试

按 `F5` 或点击绿色播放按钮开始调试

---

## 断点设置建议

### 启动流程断点（按顺序）

```
1. sample/01-cats-app/src/main.ts
   └── bootstrap() [第 5 行]
       └── NestFactory.create() [第 6 行]  ← 第一个断点

2. packages/core/nest-factory.ts
   └── create() [第 84-118 行]
       ├── 第 93 行: new ApplicationConfig()
       ├── 第 94 行: new NestContainer()  ← 容器创建
       ├── 第 100 行: initialize() 调用
       └── 第 109 行: new NestApplication()

3. packages/core/nest-factory.ts (initialize 方法)
   └── initialize() [第 206-253 行]
       ├── 第 228 行: new DependenciesScanner()
       ├── 第 243 行: dependenciesScanner.scan()
       └── 第 244 行: instanceLoader.createInstancesOfDependencies()

4. packages/core/scanner.ts
   └── scan() [第 86-104 行]
       ├── 第 90 行: registerCoreModule()
       ├── 第 91-94 行: scanForModules()
       └── 第 95 行: scanModulesForDependencies()

5. packages/core/injector/instance-loader.ts
   └── createInstancesOfDependencies() [第 25-38 行]
       ├── 第 28 行: createPrototypes()
       └── 第 31 行: createInstances()

6. packages/core/nest-application.ts
   └── init() [第 176-197 行]
       ├── 第 181 行: applyOptions()
       ├── 第 186 行: registerParserMiddleware()
       ├── 第 188 行: registerModules()
       └── 第 189 行: registerRouter()  ← 路由注册
```

### 依赖注入断点

```
packages/core/injector/injector.ts
├── loadProvider() [约第 200 行]
├── loadController() [约第 280 行]
├── resolveConstructorParams() [约第 400 行]
└── instantiateClass() [约第 500 行]
```

### 路由注册断点

```
packages/core/router/routes-resolver.ts
├── resolve() [第 71 行]
└── registerRouters() [第 88 行]

packages/core/router/router-explorer.ts
├── explore() [约第 100 行]
└── createRouterProxy() [约第 200 行]
```

---

## 调试面板使用

### 变量面板

观察当前作用域的变量：
- `container` - NestContainer 实例
- `injector` - Injector 实例
- `moduleRef` - 当前模块引用

### 调用堆栈面板

查看函数调用顺序：
```
bootstrap() → NestFactory.create() → DependenciesScanner.scan() → ...
```

###监视面板

添加监视表达式：
- `container.getModules()` - 查看所有模块
- `container.getProviders()` - 查看所有提供者
- `modules.size` - 模块数量

---

## 常见问题

### Q1: 断点不生效？

确保：
1. `justMyCode: false` 已设置
2. `smartStep: false` 已设置
3. 选择的是 `Debug NestJS 源码 (ts-node + paths)` 配置

### Q2: 无法进入 NestJS 源码？

检查 `tsconfig.json` 的 `paths` 配置是否正确指向 `../../packages/`

### Q3: 找不到模块？

运行：
```bash
cd sample/01-cats-app
npm install
```

---

## 推荐的调试流程

### 第一次调试

1. 在 `main.ts:6` 设置断点
2. 按 `F5` 开始
3. 按 `F11` (步入) 进入 `NestFactory.create()`

### 第二次调试

1. 清除所有断点
2. 在 `scanner.ts:86` 设置断点
3. 在 `instance-loader.ts:25` 设置断点
4. 按 `F5` 开始，观察模块扫描和实例化过程

### 第三次调试

1. 在 `routes-resolver.ts:189` 设置断点
2. 在 `router-explorer.ts` 的 `explore()` 方法设置断点
3. 按 `F5` 开始，观察路由注册过程

---

## 相关资源

- [NestJS 启动流程调试指南](../../analyze/NestJS启动流程调试指南.md)
- [项目结构分析](../../analyze/项目结构分析报告.md)
- [源码学习计划](../../analyze/源码学习计划.md)
