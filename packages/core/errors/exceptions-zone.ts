import { Logger } from '@nestjs/common';
import { ExceptionHandler } from './exception-handler';

/** 默认的"拆除"函数：未捕获异常导致进程直接退出（exit code 1）。 */
const DEFAULT_TEARDOWN = () => process.exit(1);

/**
 * 异常区域（ExceptionsZone）：Nest 用来"兜底捕获"应用代码异常的执行环境。
 *
 * 应用实例方法（NestFactory 的 createExceptionZone 代理）与启动流程
 * （NestFactory.initialize）都在该区域内执行回调：
 * - 异常先被 ExceptionHandler 记录；
 * - 可选地立即刷新缓冲日志（autoFlushLogs）；
 * - 再交给 teardown 处理：默认终止进程（abortOnError 策略），
 *   或由调用方传入 rethrow 重新抛出。
 */
export class ExceptionsZone {
  private static readonly exceptionHandler = new ExceptionHandler();

  /**
   * 在异常区域中同步执行回调，并统一处理抛出的异常。
   *
   * @param callback - 待执行的同步回调
   * @param teardown - 异常发生后的处理函数（默认终止进程）
   * @param autoFlushLogs - 异常发生时是否立即刷新缓冲日志
   */
  public static run(
    callback: () => void,
    teardown: (err: any) => void = DEFAULT_TEARDOWN,
    autoFlushLogs: boolean,
  ) {
    try {
      callback();
    } catch (e) {
      this.exceptionHandler.handle(e);
      if (autoFlushLogs) {
        Logger.flush();
      }
      teardown(e);
    }
  }

  /**
   * 在异常区域中异步执行回调（等待 Promise 完成），并统一处理异常。
   *
   * @param callback - 待执行的异步回调
   * @param teardown - 异常发生后的处理函数（默认终止进程）
   * @param autoFlushLogs - 异常发生时是否立即刷新缓冲日志
   */
  public static async asyncRun(
    callback: () => Promise<void>,
    teardown: (err: any) => void = DEFAULT_TEARDOWN,
    autoFlushLogs: boolean,
  ) {
    try {
      await callback();
    } catch (e) {
      this.exceptionHandler.handle(e);
      if (autoFlushLogs) {
        Logger.flush();
      }
      teardown(e);
    }
  }
}
