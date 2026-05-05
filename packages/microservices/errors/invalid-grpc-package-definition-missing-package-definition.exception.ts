import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

export class InvalidGrpcPackageDefinitionMissingPackageDefinitionException extends RuntimeException {
  constructor() {
    super(
      `无效的 gRPC 配置。必须定义 protoPath 或 packageDefinition。`,
    );
  }
}
