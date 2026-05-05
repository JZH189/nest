import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

export interface RpcDecoratorMetadata {
  service: string;
  rpc: string;
  streaming: string;
}

/**
 * @publicApi
 */
export class InvalidGrpcDecoratorException extends RuntimeException {
  constructor(metadata: RpcDecoratorMetadata) {
    super(
      `无效的 gRPC 装饰器（服务 "${metadata.service}" 中的方法 "${metadata.rpc}"）`,
    );
  }
}
