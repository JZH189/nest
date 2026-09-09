import { INestApplicationContext, WebSocketAdapter } from '@nestjs/common';
import { WsMessageHandler } from '@nestjs/common/interfaces';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { NestApplication } from '@nestjs/core';
import { Observable } from 'rxjs';
import { CONNECTION_EVENT, DISCONNECT_EVENT } from '../constants';

/**
 * 基础 WebSocket 实例接口：约束底层服务器与客户端 socket 都必须具备的最小能力——
 * 通过 on 监听事件、通过 close 关闭。适配器仅依赖这一最小契约，从而兼容
 * socket.io、ws 等不同的底层库。
 */
export interface BaseWsInstance {
  /** 监听指定事件。 */
  on: (event: string, callback: Function) => void;
  /** 关闭服务器/连接。 */
  close: Function;
}

/**
 * WebSocket 适配器抽象基类：定义网关与底层 WebSocket 库之间的桥接契约。
 *
 * Nest 不直接依赖具体 WebSocket 实现，而是通过本抽象与 IoAdapter 交互。
 * 子类（如 platform-socket.io 的 SocketIoAdapter）需要实现：
 * - create：按端口与选项创建服务器；
 * - bindMessageHandlers：将消息处理器绑定到客户端 socket。
 * 本基类提供了基于 CONNECTION_EVENT/DISCONNECT_EVENT 约定的通用实现。
 *
 * @typeParam TServer - 底层 WebSocket 服务器类型。
 * @typeParam TClient - 客户端 socket 类型。
 * @typeParam TOptions - 适配器选项类型。
 */
export abstract class AbstractWsAdapter<
  TServer extends BaseWsInstance = any,
  TClient extends BaseWsInstance = any,
  TOptions = any,
> implements WebSocketAdapter<TServer, TClient, TOptions> {
  /** 底层 HTTP 服务器（WebSocket 服务器可挂载其上以复用端口）。 */
  protected readonly httpServer: any;
  private _forceCloseConnections: boolean;

  /** 设置应用关闭时是否强制断开所有客户端连接。 */
  public set forceCloseConnections(value: boolean) {
    this._forceCloseConnections = value;
  }

  /** 读取 forceCloseConnections 配置。 */
  public get forceCloseConnections(): boolean {
    return this._forceCloseConnections;
  }

  /**
   * 构造适配器。
   *
   * 处理步骤：
   * 1. 若传入的是 NestApplication 实例，则取出其底层 HTTP 服务器；
   * 2. 否则将传入对象直接视为 HTTP 服务器（或为空）。
   *
   * @param appOrHttpServer - Nest 应用实例或底层 HTTP 服务器（可选）。
   */
  constructor(appOrHttpServer?: INestApplicationContext | object) {
    if (appOrHttpServer && appOrHttpServer instanceof NestApplication) {
      this.httpServer = appOrHttpServer.getUnderlyingHttpServer();
    } else {
      this.httpServer = appOrHttpServer;
    }
  }

  /**
   * 将“新客户端连接”回调绑定到服务器的 connection 事件。
   *
   * @param server - WebSocket 服务器实例。
   * @param callback - 新连接建立时执行的回调。
   * @returns 无返回值。
   */
  public bindClientConnect(server: TServer, callback: Function) {
    server.on(CONNECTION_EVENT, callback);
  }

  /**
   * 将“客户端断开”回调绑定到客户端 socket 的 disconnect 事件。
   *
   * @param client - 客户端 socket。
   * @param callback - 断开连接时执行的回调。
   * @returns 无返回值。
   */
  public bindClientDisconnect(client: TClient, callback: Function) {
    client.on(DISCONNECT_EVENT, callback);
  }

  /**
   * 关闭 WebSocket 服务器（Promise 包装 close 回调，等待关闭完成）。
   *
   * @param server - 要关闭的服务器实例。
   * @returns 服务器完全关闭后解析的 Promise。
   */
  public async close(server: TServer) {
    const isCallable = server && isFunction(server.close);
    isCallable && (await new Promise(resolve => server.close(resolve)));
  }

  /**
   * 释放适配器持有的资源（默认空实现，子类可按需覆盖）。
   *
   * @returns 立即解析的 Promise。
   */
  public async dispose() {}

  /** 创建 WebSocket 服务器（由具体平台适配器实现）。 */
  public abstract create(port: number, options?: TOptions): TServer;
  /**
   * 将消息处理器绑定到客户端 socket（由具体平台适配器实现）。
   *
   * @param client - 客户端 socket。
   * @param handlers - 消息处理器数组。
   * @param transform - 将处理器结果转换为 Observable 的变换函数。
   */
  public abstract bindMessageHandlers(
    client: TClient,
    handlers: WsMessageHandler[],
    transform: (data: any) => Observable<any>,
  );
}
