import { Logger } from '@nestjs/common';
import { ExternalContextCreator } from '../../helpers/external-context-creator';
import { HttpAdapterHost } from '../../helpers/http-adapter-host';
import { GraphInspector } from '../../inspector/graph-inspector';
import { InitializeOnPreviewAllowlist } from '../../inspector/initialize-on-preview.allowlist';
import { SerializedGraph } from '../../inspector/serialized-graph';
import { ModuleOverride } from '../../interfaces/module-override.interface';
import { DependenciesScanner } from '../../scanner';
import { ModuleCompiler } from '../compiler';
import { NestContainer } from '../container';
import { Injector } from '../injector';
import { InstanceLoader } from '../instance-loader';
import { LazyModuleLoader } from '../lazy-module-loader/lazy-module-loader';
import { ModulesContainer } from '../modules-container';
import { InternalCoreModule } from './internal-core-module';

/**
 * 内部核心模块工厂
 *
 * 负责创建 InternalCoreModule，将框架级别的核心服务注册为全局提供者。
 * 这些服务可在任意模块中直接注入，无需显式 import。
 */
export class InternalCoreModuleFactory {
  /**
   * 创建内部核心模块
   *
   * @param container - 依赖注入容器
   * @param scanner - 依赖扫描器（用于懒加载模块）
   * @param moduleCompiler - 模块编译器
   * @param httpAdapterHost - HTTP 适配器主机
   * @param graphInspector - 依赖图检查器
   * @param moduleOverrides - 模块覆盖配置（可选）
   */
  static create(
    container: NestContainer,
    scanner: DependenciesScanner,
    moduleCompiler: ModuleCompiler,
    httpAdapterHost: HttpAdapterHost,
    graphInspector: GraphInspector,
    moduleOverrides?: ModuleOverride[],
  ) {
    // 创建懒加载模块加载器工厂函数
    const lazyModuleLoaderFactory = () => {
      const logger = new Logger(LazyModuleLoader.name, {
        timestamp: false,
      });
      // 为懒加载创建独立的注入器和实例加载器
      const injector = new Injector({
        preview: container.contextOptions?.preview!,
        instanceDecorator:
          container.contextOptions?.instrument?.instanceDecorator,
      });
      const instanceLoader = new InstanceLoader(
        container,
        injector,
        graphInspector,
        logger,
      );
      return new LazyModuleLoader(
        scanner,
        instanceLoader,
        moduleCompiler,
        container.getModules(),
        moduleOverrides,
      );
    };

    // 将内部核心模块添加到预览模式白名单
    InitializeOnPreviewAllowlist.add(InternalCoreModule);

    // 注册框架核心服务为全局提供者
    return InternalCoreModule.register([
      {
        provide: ExternalContextCreator,
        useFactory: () => ExternalContextCreator.fromContainer(container),
        // 用于创建守卫、管道等装饰器的执行上下文
      },
      {
        provide: ModulesContainer,
        useFactory: () => container.getModules(),
        // 提供模块容器访问，支持运行时查看所有模块
      },
      {
        provide: HttpAdapterHost,
        useFactory: () => httpAdapterHost,
        // 提供底层 HTTP 适配器（Express/Fastify）的访问
      },
      {
        provide: LazyModuleLoader,
        useFactory: lazyModuleLoaderFactory,
        // 支持运行时动态加载模块
      },
      {
        provide: SerializedGraph,
        useFactory: () => container.serializedGraph,
        // 提供依赖关系图，用于快照模式
      },
    ]);
  }
}
