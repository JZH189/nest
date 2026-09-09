import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 当在 gRPC 包中找不到配置指定的服务定义时抛出。
 *
 * @publicApi
 */
export class InvalidGrpcServiceException extends RuntimeException {
  constructor(name: string) {
    super(`无效的 gRPC 服务（服务 "${name}" 未找到）`);
  }
}
