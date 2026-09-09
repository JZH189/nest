import { Transport } from '../enums';
import { PatternMetadata } from './pattern-metadata.interface';

/**
 * 微服务入口点（handler）的元数据描述：由 @MessagePattern/@EventPattern
 * 装饰器在扫描阶段生成，用于「Discovery/装饰器扫描」场景读取微服务端点信息。
 * - transportId：所属传输器（Transport 枚举键或自定义 Symbol）；
 * - patterns：该端点绑定的消息模式列表；
 * - isEventHandler：是否为事件处理器（@EventPattern）；
 * - extras：装饰器附加的自定义元数据。
 */
export type MicroserviceEntrypointMetadata = {
  transportId: keyof typeof Transport | symbol;
  patterns: PatternMetadata[];
  isEventHandler: boolean;
  extras?: Record<string, any>;
};
