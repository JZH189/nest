import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * @publicApi
 */
export class InvalidKafkaClientTopicException extends RuntimeException {
  constructor(topic?: string) {
    super(
      `客户端消费者未订阅相应的回复主题（${topic}）。`,
    );
  }
}
