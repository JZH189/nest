import { addLeadingSlash, isString } from '@nestjs/common/utils/shared.utils';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { ServerAndEventStreamsFactory } from './factories/server-and-event-streams-factory';
import { GatewayMetadata } from './interfaces/gateway-metadata.interface';
import { ServerAndEventStreamsHost } from './interfaces/server-and-event-streams-host.interface';
import { SocketsContainer } from './sockets-container';

/**
 * WebSocket 服务器提供者：负责按需创建（或复用）底层 WebSocket 服务器。
 *
 * 多个网关可能监听同一个端口/路径，甚至只是同一服务器上的不同命名空间（namespace），
 * 本类通过 SocketsContainer 按 {port, path, namespace} 去重，避免重复创建服务器：
 * - 同端口同路径：复用已有服务器；
 * - 同端口但指定 namespace：基于已有服务器派生命名空间服务器。
 */
export class SocketServerProvider {
  constructor(
    /** 服务器容器，以配置哈希为键缓存已创建的 ServerAndEventStreamsHost。 */
    private readonly socketsContainer: SocketsContainer,
    /** 应用配置，用于获取全局 IoAdapter。 */
    private readonly applicationConfig: ApplicationConfig,
  ) {}

  /**
   * 根据网关配置查找或创建对应的 WebSocket 服务器宿主。
   *
   * 处理步骤：
   * 1. 以 {port, path} 为键在容器中查找已有的服务器宿主；
   * 2. 若找到且网关指定了 namespace，则基于已有服务器派生命名空间服务器并返回；
   * 3. 若找到且无 namespace，直接复用已有宿主；
   * 4. 否则调用 createSocketServer 新建服务器。
   *
   * @param options - 网关元数据（port、path、namespace 等）。
   * @param port - WebSocket 服务器监听的端口。
   * @returns 与配置匹配的 ServerAndEventStreamsHost（服务器 + 事件流宿主）。
   */
  public scanForSocketServer<T extends GatewayMetadata = any>(
    options: T,
    port: number,
  ): ServerAndEventStreamsHost {
    const serverAndStreamsHost = this.socketsContainer.getOneByConfig({
      port,
      path: options.path,
    });
    if (serverAndStreamsHost && options.namespace) {
      return this.decorateWithNamespace(
        options,
        port,
        serverAndStreamsHost.server,
      );
    }
    return serverAndStreamsHost
      ? serverAndStreamsHost
      : this.createSocketServer(options, port);
  }

  /**
   * 通过 IoAdapter 创建一个新的 WebSocket 服务器，并缓存到容器中。
   *
   * 处理步骤：
   * 1. 获取全局 IoAdapter，并从选项中剥离 namespace 与 server 字段得到纯净选项；
   * 2. 调用 adapter.create(port, options) 创建底层 WebSocket 服务器；
   * 3. 使用 ServerAndEventStreamsFactory 将其包装为含事件流的宿主对象；
   * 4. 以 {port, path} 为键写入容器缓存；
   * 5. 若网关指定了 namespace，则继续基于该服务器派生命名空间服务器。
   *
   * @param options - 网关元数据。
   * @param port - 监听端口。
   * @returns 新创建并已缓存的 ServerAndEventStreamsHost。
   */
  private createSocketServer<T extends GatewayMetadata>(
    options: T,
    port: number,
  ): ServerAndEventStreamsHost {
    const adapter = this.applicationConfig.getIoAdapter();
    const { namespace, server, ...partialOptions } = options as Record<
      string,
      unknown
    >;
    const ioServer = adapter.create(port, partialOptions);
    const serverAndEventStreamsHost =
      ServerAndEventStreamsFactory.create(ioServer);

    this.socketsContainer.addOne(
      { port, path: options.path },
      serverAndEventStreamsHost,
    );
    if (!namespace) {
      return serverAndEventStreamsHost;
    }
    return this.decorateWithNamespace(options, port, ioServer);
  }

  /**
   * 基于已有的目标服务器派生一个命名空间级别的服务器宿主，并缓存到容器。
   *
   * 处理步骤：
   * 1. 调用 getServerOfNamespace 通过适配器获取命名空间服务器（如 socket.io 的 io.of(namespace)）；
   * 2. 用 ServerAndEventStreamsFactory 包装为宿主对象；
   * 3. 以 {port, path, namespace} 为键写入容器缓存后返回。
   *
   * @param options - 网关元数据（需包含 namespace）。
   * @param port - 监听端口。
   * @param targetServer - 作为命名空间宿主的目标服务器实例。
   * @returns 命名空间级别的 ServerAndEventStreamsHost。
   */
  private decorateWithNamespace<T extends GatewayMetadata = any>(
    options: T,
    port: number,
    targetServer: unknown,
  ): ServerAndEventStreamsHost {
    const namespaceServer = this.getServerOfNamespace(
      options,
      port,
      targetServer,
    );
    const serverAndEventStreamsHost =
      ServerAndEventStreamsFactory.create(namespaceServer);
    this.socketsContainer.addOne(
      { port, path: options.path, namespace: options.namespace },
      serverAndEventStreamsHost,
    );
    return serverAndEventStreamsHost;
  }

  /**
   * 委托 IoAdapter 创建指定命名空间的服务器。
   *
   * @param options - 网关元数据。
   * @param port - 监听端口。
   * @param server - 底层已存在的 WebSocket 服务器实例。
   * @returns 命名空间级别的服务器对象（如 socket.io 的 Namespace）。
   */
  private getServerOfNamespace<
    TOptions extends GatewayMetadata = any,
    TServer = any,
  >(options: TOptions, port: number, server: TServer) {
    const adapter = this.applicationConfig.getIoAdapter();
    return adapter.create(port, {
      ...options,
      namespace: this.validateNamespace(options.namespace || ''),
      server,
    });
  }

  /**
   * 校验并规范化命名空间名称。
   *
   * @param namespace - 命名空间名称（字符串或正则）。
   * @returns 正则原样返回；字符串则确保以 '/' 开头（socket.io 命名空间的约定格式）。
   */
  private validateNamespace(namespace: string | RegExp): string | RegExp {
    if (!isString(namespace)) {
      return namespace;
    }
    return addLeadingSlash(namespace);
  }
}
