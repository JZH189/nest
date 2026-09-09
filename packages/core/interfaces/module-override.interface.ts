import { ModuleDefinition } from './module-definition.interface';

/**
 * 模块覆盖（Module Override）描述：用一个新模块替换另一个已注册模块。
 *
 * 在框架中的角色：主要用于测试场景（如 Test.createTestingModule 的
 * overrideModule 能力），将目标模块替换为替身模块而不修改业务代码。
 */
export interface ModuleOverride {
  /** 被替换的模块定义。 */
  moduleToReplace: ModuleDefinition;
  /** 替换后的新模块定义。 */
  newModule: ModuleDefinition;
}
