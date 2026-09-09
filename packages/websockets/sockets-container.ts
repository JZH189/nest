import * as hash from 'object-hash';
import { GatewayMetadata, ServerAndEventStreamsHost } from './interfaces';

/**
 * WebSocket 服务器容器：以网关配置（port/path/namespace 的对象哈希）为键，
 * 缓存已创建的 ServerAndEventStreamsHost，实现服务器实例的复用与统一管理。
 */
export class SocketsContainer {
  /** 内部缓存：配置哈希 -> 服务器与事件流宿主。 */
  private readonly serverAndEventStreamsHosts = new Map<
    string | RegExp,
    ServerAndEventStreamsHost
  >();

  /**
   * 获取容器中全部已缓存的服务器宿主。
   *
   * @returns 配置哈希到服务器宿主的 Map（SocketModule.close 时用于遍历关闭所有服务器）。
   */
  public getAll(): Map<string | RegExp, ServerAndEventStreamsHost> {
    return this.serverAndEventStreamsHosts;
  }

  /**
   * 按配置查找已缓存的服务器宿主。
   *
   * @param options - 网关元数据（port、path、namespace）。
   * @returns 匹配的 ServerAndEventStreamsHost；不存在时为 undefined。
   */
  public getOneByConfig<T extends GatewayMetadata = any>(
    options: T,
  ): ServerAndEventStreamsHost {
    const uniqueToken = this.generateHashByOptions(options);
    return this.serverAndEventStreamsHosts.get(uniqueToken)!;
  }

  /**
   * 按配置将服务器宿主写入缓存（相同配置会覆盖，即实现复用语义）。
   *
   * @param options - 网关元数据，用于生成唯一键。
   * @param host - 要缓存的服务器宿主对象。
   * @returns 无返回值。
   */
  public addOne<T extends GatewayMetadata = any>(
    options: T,
    host: ServerAndEventStreamsHost,
  ) {
    const uniqueToken = this.generateHashByOptions(options);
    this.serverAndEventStreamsHosts.set(uniqueToken, host);
  }

  /**
   * 清空容器中的所有缓存（应用关闭时由 SocketModule.close 调用）。
   *
   * @returns 无返回值。
   */
  public clear() {
    this.serverAndEventStreamsHosts.clear();
  }

  /**
   * 根据网关配置生成唯一哈希键。
   *
   * @param options - 网关元数据对象。
   * @returns 基于 options 内容的对象哈希字符串，忽略未知属性（ignoreUnknown）。
   */
  private generateHashByOptions<T extends GatewayMetadata = any>(
    options: T,
  ): string {
    return hash(options, { ignoreUnknown: true });
  }
}
