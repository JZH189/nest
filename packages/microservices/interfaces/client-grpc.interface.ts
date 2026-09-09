/**
 * gRPC 客户端接口：注入 @Inject('SERVICE_NAME') 获取的 ClientGrpc 实例，
 * 通过它按服务名取回类型化的 gRPC 服务客户端（方法签名来自 proto 定义）。
 *
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
