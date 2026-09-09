import { OnApplicationShutdown } from '@nestjs/common';
import { isFunction, isNil } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import {
  getNonTransientInstances,
  getTransientInstances,
} from '../injector/helpers/transient-instances';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';

/**
 * Checks if the given instance has the `onApplicationShutdown` function
 *
 * @param instance The instance which should be checked
 */
function hasOnAppShutdownHook(
  instance: unknown,
): instance is OnApplicationShutdown {
  return isFunction((instance as OnApplicationShutdown).onApplicationShutdown);
}

/**
 * Calls the given instances
 */
function callOperator(
  instances: InstanceWrapper[],
  signal?: string,
): Promise<any>[] {
  return iterate(instances)
    .filter(instance => !isNil(instance))
    .filter(hasOnAppShutdownHook)
    .map(async instance =>
      (instance as any as OnApplicationShutdown).onApplicationShutdown(signal),
    )
    .toArray();
}

/**
 * on-app-shutdown 钩子调用器：应用关闭流程中的阶段（位于
 * beforeApplicationShutdown 之后、onModuleDestroy 之前）。
 *
 * 在框架中的角色：app.close() / 收到系统信号后，Nest 调用所有实现了
 * OnApplicationShutdown 接口实例的 onApplicationShutdown(signal)，
 * 并传入导致关闭的系统信号，适合做连接池关闭、任务终止等清理。
 *
 * @param module - 待触发钩子的模块
 * @param signal - 导致应用关闭的系统信号（如 'SIGTERM'）
 * @returns 所有钩子执行完成后兑现的 Promise
 */
export async function callAppShutdownHook(
  module: Module,
  signal?: string,
): Promise<any> {
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
  await Promise.all(callOperator(nonTransientInstances, signal));
  const transientInstances = getTransientInstances(instances);
  await Promise.all(callOperator(transientInstances, signal));

  // Call the instance itself
  const moduleClassInstance = moduleClassHost.instance;
  if (
    moduleClassInstance &&
    hasOnAppShutdownHook(moduleClassInstance) &&
    moduleClassHost.isDependencyTreeStatic()
  ) {
    await moduleClassInstance.onApplicationShutdown(signal);
  }
}
