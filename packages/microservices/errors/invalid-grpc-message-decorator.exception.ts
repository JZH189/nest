import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

export interface RpcDecoratorMetadata {
  service: string;
  rpc: string;
  streaming: string;
}

/**
 * 当 gRPC 流式方法的装饰器元数据不完整或与 proto 定义不匹配（如缺少流式标记）时抛出。
 *
 * @publicApi
 */
export class InvalidGrpcDecoratorException extends RuntimeException {
  constructor(metadata: RpcDecoratorMetadata) {
    super(
      `无效的 gRPC 装饰器（服务 "${metadata.service}" 中的方法 "${metadata.rpc}"）`,
    );
  }
}
