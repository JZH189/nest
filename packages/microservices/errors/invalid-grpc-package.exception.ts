import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 当在已加载的 proto 包定义中找不到配置指定的 gRPC 包（namespace）时抛出。
 *
 * @publicApi
 */
export class InvalidGrpcPackageException extends RuntimeException {
  constructor(name: string) {
    super(`无效的 gRPC 包（包 "${name}" 未找到）`);
  }
}
