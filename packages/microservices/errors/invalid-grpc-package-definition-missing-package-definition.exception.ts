import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 当 gRPC 传输器配置中既未提供 protoPath 也未提供 packageDefinition 时抛出。
 */
export class InvalidGrpcPackageDefinitionMissingPackageDefinitionException extends RuntimeException {
  constructor() {
    super(
      `无效的 gRPC 配置。必须定义 protoPath 或 packageDefinition。`,
    );
  }
}
