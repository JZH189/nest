import { ClientProxy } from './client/client-proxy';

/**
 * 客户端容器：集中管理当前应用中所有由 @Client 注入创建的 ClientProxy 实例。
 * 在应用关闭（close）时，NestMicroservice 会遍历该容器，
 * 逐个调用客户端的 close() 方法以释放底层连接（TCP socket、Kafka producer 等）。
 */
export class ClientsContainer {
  /** 已注册的客户端实例列表 */
  private clients: ClientProxy[] = [];

  /**
   * 获取所有已注册的客户端实例。
   * @returns ClientProxy 实例数组
   */
  public getAllClients(): ClientProxy[] {
    return this.clients;
  }

  /**
   * 注册一个客户端实例到容器中。
   * @param client - 由 @Client 注入创建的 ClientProxy 实例
   */
  public addClient(client: ClientProxy) {
    this.clients.push(client);
  }

  /** 清空容器（应用重新初始化时使用） */
  public clear() {
    this.clients = [];
  }
}
