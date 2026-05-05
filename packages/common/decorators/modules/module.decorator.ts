import { ModuleMetadata } from '../../interfaces/modules/module-metadata.interface';
import { validateModuleKeys } from '../../utils/validate-module-keys.util';

/**
 * 将类标记为[模块](https://docs.nestjs.cn/modules)的装饰器。
 *
 * 模块用于 Nest 将应用程序结构组织到作用域中。控制器和提供者由它们声明所在的模块限定作用域。
 * 模块及其类（控制器和提供者）形成一个图，该图决定了 Nest 如何执行
 * [依赖注入 (DI)](https://docs.nestjs.cn/providers#dependency-injection)。
 *
 * @param metadata 模块配置元数据
 *
 * @see [模块](https://docs.nestjs.cn/modules)
 *
 * @publicApi
 */
export function Module(metadata: ModuleMetadata): ClassDecorator {
  const propsKeys = Object.keys(metadata);
  validateModuleKeys(propsKeys);

  return (target: Function) => {
    for (const property in metadata) {
      if (Object.hasOwnProperty.call(metadata, property)) {
        Reflect.defineMetadata(property, (metadata as any)[property], target);
      }
    }
  };
}
