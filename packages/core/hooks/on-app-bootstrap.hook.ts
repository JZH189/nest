import { OnApplicationBootstrap } from '@nestjs/common';
import { isFunction, isNil } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import {
  getNonTransientInstances,
  getTransientInstances,
} from '../injector/helpers/transient-instances';
import { InstanceWrapper } from '../injector/instance-wrapper';
import { Module } from '../injector/module';

/**
 * Checks if the given instance has the `onApplicationBootstrap` function
 *
 * @param instance The instance which should be checked
 */
function hasOnAppBootstrapHook(
  instance: unknown,
): instance is OnApplicationBootstrap {
  return isFunction(
    (instance as OnApplicationBootstrap).onApplicationBootstrap,
  );
}

/**
 * Calls the given instances
 */
function callOperator(instances: InstanceWrapper[]): Promise<any>[] {
  return iterate(instances)
    .filter(instance => !isNil(instance))
    .filter(hasOnAppBootstrapHook)
    .map(async instance =>
      (instance as any as OnApplicationBootstrap).onApplicationBootstrap(),
    )
    .toArray();
}

/**
 * on-app-bootstrap 钩子调用器：应用完全初始化并开始监听之前的启动阶段。
 *
 * 在框架中的角色：在所有模块的 onModuleInit 完成之后、应用开始监听
 * （listen）之前，Nest 遍历各模块调用实现了 OnApplicationBootstrap 接口
 * 实例的 onApplicationBootstrap()，适合执行“依赖注入全部就绪后”的
 * 启动逻辑（如预热缓存、建立连接）。
 *
 * @param module - 待触发钩子的模块
 * @returns 所有钩子执行完成后兑现的 Promise
 */
export async function callModuleBootstrapHook(module: Module): Promise<any> {
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
    hasOnAppBootstrapHook(moduleClassInstance) &&
    moduleClassHost.isDependencyTreeStatic()
  ) {
    await moduleClassInstance.onApplicationBootstrap();
  }
}
