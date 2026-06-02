import { DynamicModule, Global, Module } from '@nestjs/common';
import {
  ExistingProvider,
  FactoryProvider,
  ValueProvider,
} from '@nestjs/common/interfaces';
import { requestProvider } from '../../router/request/request-providers';
import { Reflector } from '../../services';
import { inquirerProvider } from '../inquirer/inquirer-providers';

// Reflector 别名提供者：允许通过字符串 'Reflector' 注入，而非仅通过类类型
const ReflectorAliasProvider = {
  provide: Reflector.name,   // token = 'Reflector'
  useExisting: Reflector,     // 复用已有的 Reflector 实例
};

/**
 * 框架内部核心模块（@Global）
 *
 * 作为 NestJS 框架自身依赖的基础模块，提供以下核心服务：
 * - Reflector：用于读取装饰器元数据
 * - requestProvider：请求作用域的提供者（每个请求创建新实例）
 * - inquirerProvider：询问者提供者（允许注入当前实例的创建者）
 *
 * 由 InternalCoreModuleFactory 调用 register() 方法
 * 进一步注入 ExternalContextCreator 等额外核心服务。
 *
 * @see InternalCoreModuleFactory
 */
@Global()
@Module({
  providers: [
    Reflector,               // 反射服务：运行时读取装饰器元数据
    ReflectorAliasProvider,   // 反射服务别名：支持字符串 token 注入
    requestProvider,         // 请求作用域：为每个 HTTP 请求提供独立实例
    inquirerProvider,        // 询问者注入：允许获取当前实例的创建者引用
  ],
  exports: [
    Reflector,
    ReflectorAliasProvider,
    requestProvider,
    inquirerProvider,
  ],
})
export class InternalCoreModule {
  /**
   * 动态注册额外的全局提供者
   *
   * 由 InternalCoreModuleFactory 调用，将 ExternalContextCreator、
   * ModulesContainer、HttpAdapterHost 等运行时服务注入到模块中。
   *
   * @param providers - 额外的提供者数组
   * @returns DynamicModule 配置
   */
  static register(
    providers: Array<ValueProvider | FactoryProvider | ExistingProvider>,
  ): DynamicModule {
    return {
      module: InternalCoreModule,
      providers: [...providers],                         // 合并传入的提供者
      exports: [...providers.map(item => item.provide)], // 导出所有附加提供者的 token
    };
  }
}
