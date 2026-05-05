import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * @publicApi
 */
export class InvalidGrpcPackageException extends RuntimeException {
  constructor(name: string) {
    super(`无效的 gRPC 包（包 "${name}" 未找到）`);
  }
}
