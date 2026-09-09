import { Logger } from '@nestjs/common/services/logger.service';

/**
 * 统一异常处理器：将运行期未捕获的异常通过 Logger 以 error 级别输出。
 * 由 ExceptionsZone 在捕获到异常后调用。
 */
export class ExceptionHandler {
  private static readonly logger = new Logger(ExceptionHandler.name);

  /**
   * 处理（记录）一个未捕获的异常。
   *
   * @param exception - 被捕获的异常对象
   */
  public handle(exception: Error) {
    ExceptionHandler.logger.error(exception);
  }
}
