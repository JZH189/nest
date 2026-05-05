import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * @publicApi
 */
export class InvalidGrpcServiceException extends RuntimeException {
  constructor(name: string) {
    super(`无效的 gRPC 服务（服务 "${name}" 未找到）`);
  }
}
