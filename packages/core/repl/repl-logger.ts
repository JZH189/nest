import { ConsoleLogger } from '@nestjs/common';
import { NestApplication } from '../nest-application';
import { RouterExplorer } from '../router/router-explorer';
import { RoutesResolver } from '../router/routes-resolver';

/**
 * REPL 专用的日志记录器，继承自 ConsoleLogger。
 *
 * 在 REPL 模式下，应用启动过程中由路由解析（RoutesResolver）、
 * 路由扫描（RouterExplorer）、应用映射（NestApplication）产生的
 * 大量路由注册日志对调试没有价值，因此这里按 context 名称
 * 将这些"噪音"日志静默过滤掉，其余日志正常输出。
 */
export class ReplLogger extends ConsoleLogger {
  /** 需要被忽略（不打印）的日志上下文名称列表 */
  private static readonly ignoredContexts = [
    RoutesResolver.name,
    RouterExplorer.name,
    NestApplication.name,
  ];

  /**
   * 重写 log 方法：命中被忽略上下文的日志直接丢弃，其余交由父类输出。
   *
   * @param _message - 日志内容（未直接使用，透传给父类）。
   * @param context - 日志上下文名称，用于判断是否需要过滤。
   */
  log(_message: any, context?: string) {
    if (ReplLogger.ignoredContexts.includes(context!)) {
      return;
    }
    // eslint-disable-next-line
    return super.log.apply(this, Array.from(arguments) as [any, string?]);
  }
}
