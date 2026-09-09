import { MODULE_METADATA as metadataConstants } from '../constants';

/**
 * 生成 @Module() 装饰器接收到非法属性时的错误消息（标签模板函数）。
 *
 * @param text 模板字符串的静态部分
 * @param property 非法的属性名
 * @returns 格式化的错误消息
 */
export const INVALID_MODULE_CONFIG_MESSAGE = (
  text: TemplateStringsArray,
  property: string,
) => `Invalid property '${property}' passed into the @Module() decorator.`;

// @Module() 装饰器允许的四个元数据键：imports、exports、controllers、providers
const metadataKeys = [
  metadataConstants.IMPORTS,
  metadataConstants.EXPORTS,
  metadataConstants.CONTROLLERS,
  metadataConstants.PROVIDERS,
];

/**
 * 校验 @Module() 装饰器收到的元数据键是否全部合法
 * （必须是 imports / exports / controllers / providers 之一）。
 * 发现非法键时立即抛出错误，用于在模块定义阶段尽早暴露拼写错误等问题。
 *
 * @param keys 待校验的元数据键列表
 * @returns 全部合法时无返回值；存在非法键时抛出 Error
 */
export function validateModuleKeys(keys: string[]) {
  const validateKey = (key: string) => {
    if (metadataKeys.includes(key)) {
      return;
    }
    throw new Error(INVALID_MODULE_CONFIG_MESSAGE`${key}`);
  };
  keys.forEach(validateKey);
}
