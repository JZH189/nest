import { DynamicModule, ForwardReference } from '@nestjs/common';
import { Type } from '@nestjs/common/interfaces';

/**
 * 模块定义（Module Definition）：模块可以出现的所有合法形态的联合类型。
 *
 * 在框架中的角色：在模块注册、imports 声明、模块覆盖等场景中统一描述
 * "一个模块"，可以是前向引用（ForwardReference）、普通模块类、
 * 动态模块对象（DynamicModule）或解析为动态模块的 Promise。
 */
export type ModuleDefinition =
  | ForwardReference
  | Type<unknown>
  | DynamicModule
  | Promise<DynamicModule>;
