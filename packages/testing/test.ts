import { ModuleMetadata } from '@nestjs/common/interfaces/modules/module-metadata.interface';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import {
  TestingModuleBuilder,
  TestingModuleOptions,
} from './testing-module.builder';

/**
 * NestJS 测试工具的静态入口类。
 *
 * 使用方式：`Test.createTestingModule({ imports: [...], providers: [...] })`
 * 创建一个 TestingModuleBuilder，随后通过链式调用覆盖依赖
 * （overrideProvider/overrideGuard/overrideModule 等），
 * 再调用 `.compile()` 编译得到 TestingModule，
 * 最后通过 `createNestApplication()` 或 `app.get()` 获取被测对象。
 *
 * 它是 `@nestjs/testing` 包对用户暴露的主要 API（与 NestFactory
 * 在生产代码中的角色对应，专门用于单元测试/集成测试环境）。
 */
export class Test {
  /** 共享的元数据扫描器，用于编译模块时扫描依赖与方法元数据 */
  private static readonly metadataScanner = new MetadataScanner();

  /**
   * 创建一个测试模块构建器（TestingModuleBuilder）。
   * 此时模块尚未编译，可在返回的 builder 上继续配置覆盖项与日志器。
   *
   * @param metadata - 模块元数据（等价于 @Module() 装饰器接收的对象），
   *                   描述测试模块的 imports/controllers/providers/exports。
   * @param options - 可选的模块选项（如 moduleIdGeneratorAlgorithm）。
   * @returns 可链式配置的 TestingModuleBuilder 实例，调用 compile() 完成编译。
   */
  public static createTestingModule(
    metadata: ModuleMetadata,
    options?: TestingModuleOptions,
  ) {
    return new TestingModuleBuilder(this.metadataScanner, metadata, options);
  }
}
