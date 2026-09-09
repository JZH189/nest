/**
 * 生命周期钩子接口：客户端连接到服务器时触发 handleConnection。
 *
 * @typeParam T - 客户端 socket 类型。
 * @publicApi
 */
export interface OnGatewayConnection<T = any> {
  handleConnection(client: T, ...args: any[]): any;
}
