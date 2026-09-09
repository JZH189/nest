/**
 * 模式处理器类型：@MessagePattern / @GrpcMethod 写入 MESSAGE（1），
 * @EventPattern 写入 EVENT（2）。由 ListenerMetadataExplorer 读取，
 * 决定处理器注册为“消息（需回传响应）”还是“事件（不回传）”。
 */
export enum PatternHandler {
  MESSAGE = 1,
  EVENT = 2,
}
