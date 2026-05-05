/**
 * @publicApi
 */
export interface ClientGrpc {
  /**
   * 返回给定 gRPC 服务的实例。
   * @param name 服务名称
   * @returns gRPC 服务
   */
  getService<T extends object>(name: string): T;
  /**
   * 返回给定 gRPC 客户端的实例。
   * @param name 服务名称
   * @returns gRPC 客户端
   */
  getClientByServiceName<T = any>(name: string): T;
}
