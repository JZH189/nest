import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 当配置指定的 .proto 文件不存在或无法加载时抛出。
 *
 * @publicApi
 */
export class InvalidProtoDefinitionException extends RuntimeException {
  constructor(path: string) {
    super(`无效的 .proto 定义（文件 "${path}" 未找到）`);
  }
}
