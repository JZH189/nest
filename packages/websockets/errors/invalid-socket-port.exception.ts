import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 无效端口异常：当 @WebSocketGateway 指定的端口不是整数时抛出
 * （由 WebSocketsController.connectGatewayToServer 校验触发）。
 */
export class InvalidSocketPortException extends RuntimeException {
  /**
   * @param port - 非法的端口值。
   * @param type - 出错的网关类。
   */
  constructor(port: number | string, type: any) {
    super(`Invalid port (${port}) in gateway ${type}`);
  }
}
