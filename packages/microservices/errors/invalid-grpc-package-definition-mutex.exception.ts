import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 当 gRPC 传输器配置中同时指定了 protoPath 与 packageDefinition（两者互斥）时抛出。
 */
export class InvalidGrpcPackageDefinitionMutexException extends RuntimeException {
  constructor() {
    super(
      `无效的 gRPC 配置。protoPath 和 packageDefinition 不能同时定义。`,
    );
  }
}
