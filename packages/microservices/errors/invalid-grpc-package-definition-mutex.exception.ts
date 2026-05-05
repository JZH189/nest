import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

export class InvalidGrpcPackageDefinitionMutexException extends RuntimeException {
  constructor() {
    super(
      `无效的 gRPC 配置。protoPath 和 packageDefinition 不能同时定义。`,
    );
  }
}
