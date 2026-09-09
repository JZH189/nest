/**
 * Nest 网关接口：@WebSocketGateway 标记的类所应实现的（可选）生命周期钩子集合。
 * WebSocketsController 会在对应事件发生时调用这些钩子（存在才订阅）。
 *
 * @publicApi
 */
export interface NestGateway {
  afterInit?: (server: any) => void;
  handleConnection?: (...args: any[]) => void;
  handleDisconnect?: (client: any) => void;
}
