import { ModuleDefinition } from '@nestjs/core/interfaces/module-definition.interface';
import { TestingModuleBuilder } from '../testing-module.builder';

/**
 * @publicApi
 *
 * 模块覆盖接口：overrideModule() 返回的对象，通过 useModule 指定
 * 用于替换目标模块的新模块定义（如把真实数据库模块换成测试内存模块），
 * 返回 builder 自身以支持链式调用。
 */
export interface OverrideModule {
  /** 用 newModule 替换被覆盖的模块 */
  useModule: (newModule: ModuleDefinition) => TestingModuleBuilder;
}
