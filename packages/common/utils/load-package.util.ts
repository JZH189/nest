import { Logger } from '../services/logger.service';

const MISSING_REQUIRED_DEPENDENCY = (name: string, reason: string) =>
  `"${name}" 包缺失。请确保已安装它以利用 ${reason}。`;

const logger = new Logger('PackageLoader');

export function loadPackage(
  packageName: string,
  context: string,
  loaderFn?: Function,
) {
  try {
    return loaderFn ? loaderFn() : require(packageName);
  } catch (e) {
    logger.error(MISSING_REQUIRED_DEPENDENCY(packageName, context));
    Logger.flush();
    process.exit(1);
  }
}
