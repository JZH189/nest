import { GLOBAL_MODULE_METADATA } from '../../constants';

/**
 * 使模块成为全局作用域的装饰器。
 *
 * 一旦导入到任何模块中，全局作用域模块将在所有模块中可见。
 * 此后，希望注入从全局模块导出的服务的模块不需要导入提供者模块。
 *
 * @see [全局模块](https://docs.nestjs.cn/modules#global-modules)
 *
 * @publicApi
 */
export function Global(): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata(GLOBAL_MODULE_METADATA, true, target);
  };
}
