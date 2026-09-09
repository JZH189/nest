import { BeforeApplicationShutdown } from '@nestjs/common';
import { isFunction, isNil } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import {
  getNonTransientInstances,
  getTransientInstances,
} from '../injector/helpers/transient-instances';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';

/**
 * Checks if the given instance has the `beforeApplicationShutdown` function
 *
 * @param instance The instance which should be checked
 */
function hasBeforeApplicationShutdownHook(
  instance: unknown,
): instance is BeforeApplicationShutdown {
  return isFunction(
    (instance as BeforeApplicationShutdown).beforeApplicationShutdown,
  );
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
    .filter(hasBeforeApplicationShutdownHook)
    .map(async instance =>
      (instance as any as BeforeApplicationShutdown).beforeApplicationShutdown(
        signal,
      ),
    )
    .toArray();
}

/**
 * before-app-shutdown 钩子调用器：应用收到关闭信号后的第一个生命周期阶段。
 *
 * 在框架中的角色：app.close() / 收到系统信号时，Nest 会先于
 * onApplicationShutdown / onModuleDestroy 调用所有实现了
 * BeforeApplicationShutdown 接口实例的 beforeApplicationShutdown(signal)，
 * 此时尚可继续接收请求，适合做“停止接收新流量前”的准备。
 *
 * @param module - 待触发钩子的模块
 * @param signal - 导致应用关闭的系统信号（如 'SIGTERM'）
 * @returns 所有钩子执行完成后兑现的 Promise
 */
export async function callBeforeAppShutdownHook(
  module: Module,
  signal?: string,
): Promise<void> {
  const providers = module.getNonAliasProviders();
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

  const moduleClassInstance = moduleClassHost.instance;
  if (
    moduleClassInstance &&
    hasBeforeApplicationShutdownHook(moduleClassInstance) &&
    moduleClassHost.isDependencyTreeStatic()
  ) {
    await moduleClassInstance.beforeApplicationShutdown(signal);
  }
}
