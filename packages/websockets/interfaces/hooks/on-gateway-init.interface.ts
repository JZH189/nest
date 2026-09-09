/**
 * 生命周期钩子接口：WebSocket 服务器初始化完成后触发 afterInit。
 *
 * @typeParam T - 服务器实例类型。
 * @publicApi
 */
export interface OnGatewayInit<T = any> {
  afterInit(server: T): any;
}
