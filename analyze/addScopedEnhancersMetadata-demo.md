# addScopedEnhancersMetadata 方法示例集合

> 对应源码：`packages/core/scanner.ts` -> `DependenciesScanner.addScopedEnhancersMetadata`

## 方法核心职责

将作用域为 `REQUEST` / `TRANSIENT` 的全局增强器
（`APP_GUARD` / `APP_PIPE` / `APP_INTERCEPTOR` / `APP_FILTER`）
附加到容器中所有模块的所有控制器与 `entryProvider` 上，使其在请求处理时能按需解析出每请求新实例。

### 为什么只处理 REQUEST / TRANSIENT？

- **单例（默认）增强器**：在 `applyApplicationProviders` 阶段直接挂到 `applicationConfig`
- **请求/瞬态增强器**：每次请求都要新建实例，必须在控制器元数据里持有 `InstanceWrapper` 引用

## 运行链路对应关系

| 步骤 | 触发点 |
|---|---|
| 1. `scanForModules` -> `reflectProviders` -> `insertProvider` | 将 `{ provide: APP_GUARD, useClass: PerRequestGuard, scope: REQUEST }` 推入 `applicationProvidersApplyMap`（scanner.ts:486） |
| 2. `scanForModules` 结束后调用 `addScopedEnhancersMetadata` | 给每个控制器调用 `addEnhancerMetadata(perRequestGuardInstanceWrapper)` |
| 3. `app.init()` 完成 -> `applyApplicationProviders` | 因 `scope=REQUEST`，走 `getApplyRequestProvidersMap`，将 `InstanceWrapper` 注册到 `applicationConfig` 全局请求增强器列表 |
| 4. 请求 `GET /hello` 处理时 | 控制器从自身 enhancer 元数据拿到 Guard 的 wrapper，按需解析出当前请求的新实例并执行 `canActivate` |

---

## 示例 1：最小可运行 Demo —— 触发 `addScopedEnhancersMetadata`

每个请求都会新建实例的 Guard，必须由 `addScopedEnhancersMetadata` 铺到每个控制器上。

```ts
import {
  Controller, ExecutionContext, Get, Injectable,
  Module, Scope, CanActivate, APP_GUARD,
} from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class PerRequestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    return req.headers['x-token'] === 'ok';
  }
}

@Controller('hello')
export class HelloController {
  @Get()
  hello() {
    return 'hi';
  }
}

@Module({
  controllers: [HelloController],
  providers: [{ provide: APP_GUARD, useClass: PerRequestGuard }],
})
export class AppModule {}
```

跑一下即可验证：不带 `x-token: ok` 头会返回 403，带上才返回 `hi`。

---

## 示例 2：单元测试风格 —— 直接验证 `addScopedEnhancersMetadata` 的行为

> 参考真实测试：`packages/core/test/scanner.spec.ts:600-647`

伪简化版测试，演示该方法的断言要点：

- 只挑选 scope 为 `REQUEST` / `TRANSIENT` 的增强器
- 给每个 controller 与 entryProvider 调用 `addEnhancerMetadata`

真实测试使用 `sinon` + `chai`，这里仅展示逻辑骨架。

```ts
function testAddScopedEnhancersMetadata() {
  const provider = {
    moduleKey: 'moduleToken',
    providerKey: 'providerToken',
    type: APP_GUARD,
    scope: Scope.REQUEST, // 关键：请求作用域的全局 Guard
  };

  // 模拟 scanner.applicationProvidersApplyMap
  const applicationProvidersApplyMap = [provider];

  // 模拟 InstanceWrapper
  const instance = { name: 'PerRequestGuard-instance' };
  const fakeController = {
    addEnhancerMetadataCalled: false,
    addEnhancerMetadata(arg: unknown) {
      this.addEnhancerMetadataCalled = true;
      // 断言：收到的就是该 Guard 的 InstanceWrapper
      if (arg !== instance) throw new Error('should receive the guard wrapper');
    },
  };
  const fakeProvider = {
    addEnhancerMetadataCalled: false,
    addEnhancerMetadata(_arg: unknown) {
      this.addEnhancerMetadataCalled = true;
    },
  };

  // 模拟容器结构
  const moduleRef = {
    injectables: { get: () => instance },
    controllers: new Map([['HelloController', fakeController]]),
    entryProviders: [fakeProvider],
  };
  const modulesContainer = {
    get: () => moduleRef,
    values: () => [moduleRef],
  };

  // --- 复刻 addScopedEnhancersMetadata 的核心逻辑 ---
  for (const wrapper of applicationProvidersApplyMap) {
    const isRequestOrTransient = (s: Scope) =>
      s === Scope.REQUEST || s === Scope.TRANSIENT;
    if (!isRequestOrTransient(wrapper.scope)) continue;

    const { moduleKey, providerKey } = wrapper;
    const mod = modulesContainer.get(moduleKey);
    if (!mod) continue;
    const instanceWrapper = mod.injectables.get(providerKey);

    for (const m of modulesContainer.values()) {
      const targets = Array.from(m.controllers.values()).concat(
        m.entryProviders,
      );
      for (const target of targets) {
        (target as any).addEnhancerMetadata(instanceWrapper);
      }
    }
  }

  // --- 断言 ---
  if (!fakeController.addEnhancerMetadataCalled) {
    throw new Error('controller should receive addEnhancerMetadata');
  }
  if (!fakeProvider.addEnhancerMetadataCalled) {
    throw new Error('entryProvider should receive addEnhancerMetadata');
  }
  console.log('[testAddScopedEnhancersMetadata] PASS');
}

testAddScopedEnhancersMetadata();
```

---

## 示例 3：集成测试风格 —— 真实 APP_GUARD 用法

> 参考真实集成测试：`integration/hello-world/e2e/guards.spec.ts:11-42`

> **注意**：真实集成测试里 `useValue` 是单例，走 `applyApplicationProviders` 分支；只要把 `useValue` 换成 `useClass` 并给 Guard 标注 `@Injectable({ scope: Scope.REQUEST })`，就会触发 `addScopedEnhancersMetadata` 把它铺到每个控制器上。

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

@Injectable()
export class AuthGuard {
  canActivate() {
    throw new UnauthorizedException();
  }
}

function createTestModule(guard) {
  return Test.createTestingModule({
    imports: [AppModule],
    providers: [{ provide: APP_GUARD, useValue: guard }],
  }).compile();
}

describe('Guards', () => {
  let app: INestApplication;

  it(`should prevent access (unauthorized)`, async () => {
    app = (await createTestModule(new AuthGuard())).createNestApplication();
    await app.init();
    return request(app.getHttpServer()).get('/hello').expect(401);
  });
});
```

---

## 运行方式（针对示例 2）

将示例 2 的代码保存为独立 `.ts` 文件后执行：

```bash
npx ts-node addScopedEnhancersMetadata-demo.ts
# 期望输出：[testAddScopedEnhancersMetadata] PASS
```
