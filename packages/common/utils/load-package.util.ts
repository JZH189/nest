import { Logger } from '../services/logger.service';

/**
 * 生成"缺少必需依赖"的错误提示消息。
 *
 * @param name 缺失的包名
 * @param reason 该包的使用场景/上下文说明
 */
const MISSING_REQUIRED_DEPENDENCY = (name: string, reason: string) =>
  `"${name}" 包缺失。请确保已安装它以利用 ${reason}。`;

const logger = new Logger('PackageLoader');

/**
 * 加载指定的 Node 包（可选依赖的延迟加载入口）。
 *
 * Nest 的许多集成（如 TypeORM、Mongoose、Swagger 等）依赖可选的第三方包。
 * 此函数尝试加载目标包；若加载失败，则记录错误日志并直接终止进程，
 * 因为缺少该包意味着框架核心功能无法继续运行。
 *
 * @param packageName 要加载的包名
 * @param context 使用该包的功能上下文（用于错误提示，如 "the TypeORM module"）
 * @param loaderFn 自定义加载函数（可选）；不传时使用 require 加载
 * @returns 加载到的包对象；加载失败时进程将以退出码 1 终止，不会返回
 */
export function loadPackage(
  packageName: string,
  context: string,
  loaderFn?: Function,
) {
  try {
    // 优先使用调用方传入的加载函数（便于测试/特殊环境），否则使用 require
    return loaderFn ? loaderFn() : require(packageName);
  } catch (e) {
    // 加载失败视为致命错误：输出日志、清空缓冲区后退出进程
    logger.error(MISSING_REQUIRED_DEPENDENCY(packageName, context));
    Logger.flush();
    process.exit(1);
  }
}
