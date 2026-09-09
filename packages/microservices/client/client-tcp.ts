import { Logger, Type } from '@nestjs/common';
import * as net from 'net';
import { EmptyError, lastValueFrom } from 'rxjs';
import { share, tap } from 'rxjs/operators';
import { ConnectionOptions, connect as tlsConnect, TLSSocket } from 'tls';
import { ECONNREFUSED, TCP_DEFAULT_HOST, TCP_DEFAULT_PORT } from '../constants';
import { TcpEvents, TcpEventsMap, TcpStatus } from '../events/tcp.events';
import { JsonSocket, TcpSocket } from '../helpers';
import { PacketId, ReadPacket, WritePacket } from '../interfaces';
import { TcpClientOptions } from '../interfaces/client-metadata.interface';
import { ClientProxy } from './client-proxy';

/**
 * 基于 TCP 长连接的客户端实现（ClientProxy 的子类）。
 * 通过 net/tls socket 与远端 TCP 服务端（ServerTCP）通信，消息默认使用 JSON 编码（JsonSocket）。
 * 请求-响应通过给每个消息分配唯一 id 并维护 routingMap 来匹配响应。
 *
 * @publicApi
 */
export class ClientTCP extends ClientProxy<TcpEvents, TcpStatus> {
  protected readonly logger = new Logger(ClientTCP.name);
  /** 服务端端口 */
  protected readonly port: number;
  /** 服务端主机地址 */
  protected readonly host: string;
  /** socket 封装类（默认 JsonSocket，可自定义） */
  protected readonly socketClass: Type<TcpSocket>;
  /** TLS 连接选项（存在时使用 TLS） */
  protected readonly tlsOptions?: ConnectionOptions;
  /** JsonSocket 的最大缓冲区大小限制 */
  protected readonly maxBufferSize?: number;
  /** 当前 socket 封装实例（未连接时为 null） */
  protected socket: TcpSocket | null = null;
  /** 复用中的连接 Promise，保证并发 connect() 只建一次连接 */
  protected connectionPromise: Promise<any> | null = null;
  /** 连接建立前注册的事件监听器缓存，连接后统一挂到 socket 上 */
  protected pendingEventListeners: Array<{
    event: keyof TcpEvents;
    callback: TcpEvents[keyof TcpEvents];
  }> = [];

  /**
   * @param options - TCP 客户端选项（port、host、socketClass、tlsOptions 等）
   */
  constructor(options: Required<TcpClientOptions>['options']) {
    super();
    this.port = this.getOptionsProp(options, 'port', TCP_DEFAULT_PORT);
    this.host = this.getOptionsProp(options, 'host', TCP_DEFAULT_HOST);
    this.socketClass = this.getOptionsProp(options, 'socketClass', JsonSocket);
    this.tlsOptions = this.getOptionsProp(options, 'tlsOptions');
    this.maxBufferSize = this.getOptionsProp(options, 'maxBufferSize');

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 建立到服务端的 TCP 连接，连接流程：
   * 1. 已有 connectionPromise 则直接复用（避免重复连接）；
   * 2. 创建 socket 并注册连接/关闭/错误监听器（更新连接状态）；
   * 3. 补挂 pendingEventListeners 中缓存的监听器；
   * 4. 订阅 connect$，连接成功后监听 'message' 事件，收到响应交给 handleResponse 匹配回调；
   * 5. 非 TLS 连接在此处发起 connect()（TLS 在 socket 创建时即连接），
   *    将连接结果转为 Promise 缓存后返回。
   * @returns 连接完成（或失败）的 Promise
   */
  public connect(): Promise<any> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    this.socket = this.createSocket();
    this.registerConnectListener(this.socket);
    this.registerCloseListener(this.socket);
    this.registerErrorListener(this.socket);

    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.socket!.on(event, callback as any),
    );
    this.pendingEventListeners = [];

    const source$ = this.connect$(this.socket.netSocket).pipe(
      tap(() => {
        this.socket!.on('message', (buffer: WritePacket & PacketId) =>
          this.handleResponse(buffer),
        );
      }),
      share(),
    );

    // For TLS connections, the connection is initiated when the socket is created
    if (!this.tlsOptions) {
      this.socket.connect(this.port, this.host);
    }
    this.connectionPromise = lastValueFrom(source$).catch(err => {
      if (err instanceof EmptyError) {
        return;
      }
      throw err;
    });

    return this.connectionPromise;
  }

  /**
   * 处理服务端返回的响应帧：
   * 1. 反序列化 buffer 得到 { err, response, isDisposed, id }；
   * 2. 用 id 从 routingMap 中找到对应的响应回调，找不到则忽略；
   * 3. 消息结束（isDisposed）或出错时以 isDisposed: true 调用回调以终止 Observable。
   * @param buffer - 服务端返回的原始响应数据
   */
  public async handleResponse(buffer: unknown): Promise<void> {
    const { err, response, isDisposed, id } =
      await this.deserializer.deserialize(buffer);
    const callback = this.routingMap.get(id);
    if (!callback) {
      return undefined;
    }
    if (isDisposed || err) {
      return callback({
        err,
        response,
        isDisposed: true,
      });
    }
    callback({
      err,
      response,
    });
  }

  /**
   * 创建底层 socket 封装实例：
   * 1. 配置了 tlsOptions 时用 tlsConnect 创建 TLS socket（“升级”TCP socket）；
   * 2. 否则创建普通 net.Socket；
   * 3. 用 socketClass（默认 JsonSocket）包装；maxBufferSize 仅对 JsonSocket 生效。
   * @returns TcpSocket 封装实例
   */
  public createSocket(): TcpSocket {
    let socket: net.Socket | TLSSocket;
    /**
     * TLS enabled, "upgrade" the TCP Socket to TLS
     */
    if (this.tlsOptions) {
      socket = tlsConnect({
        ...this.tlsOptions,
        port: this.port,
        host: this.host,
      });
    } else {
      socket = new net.Socket();
    }
    // Pass maxBufferSize only if socketClass is JsonSocket
    // For custom socket classes, users should handle maxBufferSize in their own implementation
    if (this.maxBufferSize !== undefined && this.socketClass === JsonSocket) {
      return new this.socketClass(socket, {
        maxBufferSize: this.maxBufferSize,
      });
    }
    return new this.socketClass(socket);
  }

  /** 关闭连接：结束 socket、清理状态与挂起的监听器 */
  public close() {
    this.socket && this.socket.end();
    this.handleClose();
    this.pendingEventListeners = [];
  }

  /**
   * 注册连接成功监听器：向状态流推送 CONNECTED。
   * @param socket - socket 封装实例
   */
  public registerConnectListener(socket: TcpSocket) {
    socket.on(TcpEventsMap.CONNECT, () => {
      this._status$.next(TcpStatus.CONNECTED);
    });
  }

  /**
   * 注册错误监听器：非 ECONNREFUSED 的错误记日志；连接被拒绝则推送 DISCONNECTED 状态。
   * @param socket - socket 封装实例
   */
  public registerErrorListener(socket: TcpSocket) {
    socket.on(TcpEventsMap.ERROR, err => {
      if (err.code !== ECONNREFUSED) {
        this.handleError(err);
      } else {
        this._status$.next(TcpStatus.DISCONNECTED);
      }
    });
  }

  /**
   * 注册连接关闭监听器：推送 DISCONNECTED 状态并清理连接状态。
   * @param socket - socket 封装实例
   */
  public registerCloseListener(socket: TcpSocket) {
    socket.on(TcpEventsMap.CLOSE, () => {
      this._status$.next(TcpStatus.DISCONNECTED);
      this.handleClose();
    });
  }

  /** 记录错误日志 */
  public handleError(err: any) {
    this.logger.error(err);
  }

  /**
   * 连接关闭后的清理：置空 socket 与 connectionPromise；
   * 若仍有待响应的请求（routingMap 非空），以 "Connection closed" 错误回调它们并清空。
   */
  public handleClose() {
    this.socket = null;
    this.connectionPromise = null;

    if (this.routingMap.size > 0) {
      const err = new Error('Connection closed');
      for (const callback of this.routingMap.values()) {
        callback({ err });
      }
      this.routingMap.clear();
    }
  }

  /**
   * 注册底层 socket 事件监听器；尚未连接时先缓存，连接建立后再补挂。
   * @param event - 事件名
   * @param callback - 事件回调
   */
  public on<
    EventKey extends keyof TcpEvents = keyof TcpEvents,
    EventCallback extends TcpEvents[EventKey] = TcpEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.socket) {
      this.socket.on(event, callback as any);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  /**
   * 获取底层原生 net/tls socket 实例。
   * @returns 原生 socket（未连接时抛出错误）
   */
  public unwrap<T>(): T {
    if (!this.socket) {
      throw new Error(
        'Not initialized. Please call the "connect" method first.',
      );
    }
    return this.socket.netSocket as T;
  }

  /**
   * 发布（请求-响应式）消息到 TCP 服务端：
   * 1. 为请求包分配唯一 id；
   * 2. 序列化请求包；
   * 3. 把 id -> 回调 存入 routingMap，再通过 socket 发送；
   * 4. 返回清理函数（从 routingMap 删除该 id）；发送抛错时直接以错误回调。
   * @param partialPacket - 请求包
   * @param callback - 响应回调
   * @returns 取消订阅的清理函数
   */
  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const packet = this.assignPacketId(partialPacket);
      const serializedPacket = this.serializer.serialize(packet);

      this.routingMap.set(packet.id, callback);
      this.socket!.sendMessage(serializedPacket);

      return () => this.routingMap.delete(packet.id);
    } catch (err) {
      callback({ err });
      return () => {};
    }
  }

  /**
   * 发送事件（不等待响应）：规范化 pattern、序列化后直接通过 socket 发送。
   * @param packet - 事件包
   * @returns 发送完成的 Promise
   */
  protected async dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const serializedPacket = this.serializer.serialize({
      ...packet,
      pattern,
    });
    return this.socket!.sendMessage(serializedPacket);
  }
}
