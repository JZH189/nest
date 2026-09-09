/**
 * WebSocket 服务器描述：@WebSocketServer() 装饰器（propertyKey 选项）指定的
 * 目标端口与命名空间，用于从多个服务器中挑选要注入的实例。
 *
 * @publicApi
 */
export interface WebSocketServerOptions {
  port: number;
  namespace: string;
}
