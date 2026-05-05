import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * @publicApi
 */
export class InvalidProtoDefinitionException extends RuntimeException {
  constructor(path: string) {
    super(`无效的 .proto 定义（文件 "${path}" 未找到）`);
  }
}
