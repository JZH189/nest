/**
 * WebSocket 入口点元数据：写入 GraphInspector 的入口点描述信息，
 * 包含监听端口与订阅的消息名，供外部诊断/可视化工具使用。
 */
export type WebsocketEntrypointMetadata = {
  port: number;
  message: unknown;
};
