/**
 * 生命周期钩子接口：客户端断开连接时触发 handleDisconnect。
 *
 * @typeParam T - 客户端 socket 类型。
 * @publicApi
 */
export interface OnGatewayDisconnect<T = any> {
  handleDisconnect(client: T): any;
}
