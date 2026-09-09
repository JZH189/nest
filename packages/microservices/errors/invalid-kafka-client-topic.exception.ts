import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

/**
 * 当 Kafka 客户端尚未订阅消息指定的回复主题（reply topic）、无法投递响应时抛出。
 *
 * @publicApi
 */
export class InvalidKafkaClientTopicException extends RuntimeException {
  constructor(topic?: string) {
    super(
      `客户端消费者未订阅相应的回复主题（${topic}）。`,
    );
  }
}
