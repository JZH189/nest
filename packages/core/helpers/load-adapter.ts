import { Logger } from '@nestjs/common';

/**
 * 缺少必需依赖时输出的错误提示文案模板：
 * 提示用户安装默认平台所需的驱动包。
 * @param defaultPlatform - 默认平台包名
 * @param transport - 传输/驱动名称
 * @returns 拼接好的错误提示文案
 */
const MISSING_REQUIRED_DEPENDENCY = (
  defaultPlatform: string,
  transport: string,
) =>
  `No driver (${transport}) has been selected. In order to take advantage of the default driver, please, ensure to install the "${defaultPlatform}" package ($ npm install ${defaultPlatform}).`;

const logger = new Logger('PackageLoader');

/**
 * 按需加载适配器（驱动包）：优先使用传入的加载函数，否则 require 默认平台包。
 *
 * 在框架中的角色：Nest 核心对底层 HTTP/微服务驱动是可选依赖，
 * 启动时通过本函数懒加载；加载失败则记录错误并以退出码 1 终止进程。
 * @param defaultPlatform - 默认平台包名（如 '@nestjs/platform-express'）
 * @param transport - 传输/驱动名称（用于错误提示）
 * @param loaderFn - 自定义加载函数（可选，优先于 require）
 * @returns 加载到的适配器模块；失败时进程直接退出，不会返回
 */
export function loadAdapter(
  defaultPlatform: string,
  transport: string,
  loaderFn?: Function,
) {
  try {
    return loaderFn ? loaderFn() : require(defaultPlatform);
  } catch (e) {
    logger.error(MISSING_REQUIRED_DEPENDENCY(defaultPlatform, transport));
    process.exit(1);
  }
}
