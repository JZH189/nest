import {
  DynamicModule,
  ForwardReference,
  Type,
} from '@nestjs/common/interfaces';
import { ModuleOpaqueKeyFactory } from './opaque-key-factory/interfaces/module-opaque-key-factory.interface';

export interface ModuleFactory {
  type: Type<any>;
  token: string;
  dynamicMetadata?: Partial<DynamicModule>;
}

/**
 * 模块编译器
 *
 * 负责将用户定义的模块（静态模块、动态模块或 forwardRef）编译为统一的内部格式。
 *
 * 主要职责：
 * 1. **提取元数据**：区分静态模块和动态模块，提取模块类型和配置
 * 2. **生成唯一标识符**：使用 ModuleOpaqueKeyFactory 为每个模块生成唯一的 token
 * 3. **处理异步模块**：支持 Promise 形式的动态模块
 *
 * @example
 * ```typescript
 * const compiler = new ModuleCompiler(moduleOpaqueKeyFactory);
 * const result = await compiler.compile(AppModule);
 * // result = { type: AppModule, token: 'xxx123', dynamicMetadata: undefined }
 * ```
 */
export class ModuleCompiler {
  constructor(
    private readonly _moduleOpaqueKeyFactory: ModuleOpaqueKeyFactory,
  ) {}

  get moduleOpaqueKeyFactory(): ModuleOpaqueKeyFactory {
    return this._moduleOpaqueKeyFactory;
  }

  /**
   * 编译模块为{ type, dynamicMetadata, token }的标准格式
   *
   * @param moduleClsOrDynamic - 静态模块类、动态模块配置或 forwardRef
   * @returns 包含模块类型、唯一标识符和动态元数据的 ModuleFactory 对象
   */
  public async compile(
    moduleClsOrDynamic:
      | Type
      | DynamicModule
      | ForwardReference
      | Promise<DynamicModule>,
  ): Promise<ModuleFactory> {
    moduleClsOrDynamic = await moduleClsOrDynamic;

    const { type, dynamicMetadata } = this.extractMetadata(moduleClsOrDynamic);
    const token = dynamicMetadata
      ? this._moduleOpaqueKeyFactory.createForDynamic(
          type,
          dynamicMetadata,
          moduleClsOrDynamic as DynamicModule | ForwardReference,
        )
      : this._moduleOpaqueKeyFactory.createForStatic(
          type,
          moduleClsOrDynamic as Type,
        );

    return { type, dynamicMetadata, token };
  }

  /**
   * 提取模块元数据
   *
   * 将不同形式的模块（静态/动态/forwardRef）统一处理，返回模块类型和动态元数据。
   *
   * @param moduleClsOrDynamic - 输入的模块
   * @returns 包含 type 和 dynamicMetadata 的对象
   */
  public extractMetadata(
    moduleClsOrDynamic: Type | ForwardReference | DynamicModule,
  ): {
    type: Type;
    dynamicMetadata: Omit<DynamicModule, 'module'> | undefined;
  } {
    if (!this.isDynamicModule(moduleClsOrDynamic)) {
      return {
        type: (moduleClsOrDynamic as ForwardReference)?.forwardRef
          ? (moduleClsOrDynamic as ForwardReference).forwardRef()
          : moduleClsOrDynamic,
        dynamicMetadata: undefined,
      };
    }
    const { module: type, ...dynamicMetadata } = moduleClsOrDynamic;
    return { type, dynamicMetadata };
  }

  /**
   * 判断是否为动态模块
   *
   * @param moduleClsOrDynamic - 输入的模块
   * @returns 如果是动态模块返回 true
   */
  public isDynamicModule(
    moduleClsOrDynamic: Type | DynamicModule | ForwardReference,
  ): moduleClsOrDynamic is DynamicModule {
    return !!(moduleClsOrDynamic as DynamicModule).module;
  }
}
