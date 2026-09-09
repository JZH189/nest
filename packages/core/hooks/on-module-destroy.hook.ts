import { OnModuleDestroy } from '@nestjs/common';
import { isFunction, isNil } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import {
  getNonTransientInstances,
  getTransientInstances,
} from '../injector/helpers/transient-instances';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';

/**
 * Returns true or false if the given instance has a `onModuleDestroy` function
 *
 * @param instance The instance which should be checked
 */
function hasOnModuleDestroyHook(
  instance: unknown,
): instance is OnModuleDestroy {
  return isFunction((instance as OnModuleDestroy).onModuleDestroy);
}

/**
 * Calls the given instances onModuleDestroy hook
 */
function callOperator(instances: InstanceWrapper[]): Promise<any>[] {
  return iterate(instances)
    .filter(instance => !isNil(instance))
    .filter(hasOnModuleDestroyHook)
    .map(async instance =>
      (instance as any as OnModuleDestroy).onModuleDestroy(),
    )
    .toArray();
}

/**
 * on-module-destroy 钩子调用器：模块销毁阶段的生命周期钩子。
 *
 * 在框架中的角色：应用关闭（app.close()）或模块卸载时，在
 * onApplicationShutdown 之后、实例被容器真正销毁之前，调用所有实现了
 * OnModuleDestroy 接口实例的 onModuleDestroy()，用于释放该模块持有的资源。
 * 钩子按“非瞬态实例 → 瞬态实例 → 模块类自身（仅静态依赖树）”的顺序并行触发。
 *
 * @param module - 待触发钩子的模块
 * @returns 所有钩子执行完成后兑现的 Promise
 */
export async function callModuleDestroyHook(module: Module): Promise<any> {
  const providers = module.getNonAliasProviders();
  // Module (class) instance is the first element of the providers array
  // Lifecycle hook has to be called once all classes are properly destroyed
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

  // Call the module instance itself
  const moduleClassInstance = moduleClassHost.instance;
  if (
    moduleClassInstance &&
    hasOnModuleDestroyHook(moduleClassInstance) &&
    moduleClassHost.isDependencyTreeStatic()
  ) {
    await moduleClassInstance.onModuleDestroy();
  }
}
