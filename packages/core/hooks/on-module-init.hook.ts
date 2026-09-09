import { OnModuleInit } from '@nestjs/common';
import { isFunction, isNil } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import {
  getNonTransientInstances,
  getTransientInstances,
} from '../injector/helpers/transient-instances';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';

/**
 * Returns true or false if the given instance has a `onModuleInit` function
 *
 * @param instance The instance which should be checked
 */
function hasOnModuleInitHook(instance: unknown): instance is OnModuleInit {
  return isFunction((instance as OnModuleInit).onModuleInit);
}

/**
 * Calls the given instances
 */
function callOperator(instances: InstanceWrapper[]): Promise<any>[] {
  return iterate(instances)
    .filter(instance => !isNil(instance))
    .filter(hasOnModuleInitHook)
    .map(async instance => (instance as any as OnModuleInit).onModuleInit())
    .toArray();
}

/**
 * on-module-init 钩子调用器：模块初始化阶段的生命周期钩子。
 *
 * 在框架中的角色：模块的全部依赖实例化完成之后（依赖图按拓扑序逐模块
 * 触发），Nest 调用所有实现了 OnModuleInit 接口实例的 onModuleInit()，
 * 用于依赖注入就绪后的初始化逻辑。钩子按“非瞬态实例 → 瞬态实例 →
 * 模块类自身（仅静态依赖树）”的顺序并行触发。
 *
 * @param module - 待触发钩子的模块
 * @returns 所有钩子执行完成后兑现的 Promise
 */
export async function callModuleInitHook(module: Module): Promise<void> {
  const providers = module.getNonAliasProviders();
  // Module (class) instance is the first element of the providers array
  // Lifecycle hook has to be called once all classes are properly initialized
  const [_, moduleClassHost] = providers.shift()!;
  const instances = [
    ...module.controllers,
    ...providers,
    ...module.injectables,
    ...module.middlewares,
  ];

  const nonTransientInstances = getNonTransientInstances(instances);
  await Promise.all(callOperator(nonTransientInstances));

  const transientInstances = getTransientInstances(instances);
  await Promise.all(callOperator(transientInstances));

  // Call the instance itself
  const moduleClassInstance = moduleClassHost.instance;
  if (
    moduleClassInstance &&
    hasOnModuleInitHook(moduleClassInstance) &&
    moduleClassHost.isDependencyTreeStatic()
  ) {
    await moduleClassInstance.onModuleInit();
  }
}
