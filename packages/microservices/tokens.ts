import { REQUEST } from '@nestjs/core';

/**
 * RPC 场景下的注入令牌，等同于 @nestjs/core 中的 REQUEST。
 * 在微服务消息处理器中可通过 `@Inject(CONTEXT)` 注入当前请求的上下文宿主
 * （TcpContext、KafkaContext、NatsContext 等，均继承 BaseRpcContext），
 * 用以访问原始消息、消息头、pattern 等传输层特有信息。
 */
export const CONTEXT = REQUEST;
