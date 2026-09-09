import { Type } from '@nestjs/common';
import { isString, isUndefined } from '@nestjs/common/utils/shared.utils';
import * as net from 'net';
import { Server as NetSocket, Socket } from 'net';
import { createServer as tlsCreateServer, TlsOptions } from 'tls';
import {
  EADDRINUSE,
  ECONNREFUSED,
  NO_MESSAGE_HANDLER,
  TCP_DEFAULT_HOST,
  TCP_DEFAULT_PORT,
} from '../constants';
import { TcpContext } from '../ctx-host/tcp.context';
import { Transport } from '../enums';
import { TcpEvents, TcpEventsMap, TcpStatus } from '../events/tcp.events';
import { JsonSocket, TcpSocket } from '../helpers';
import { InvalidTcpDataReceptionException } from '../errors/invalid-tcp-data-reception.exception';
import {
  IncomingRequest,
  PacketId,
  ReadPacket,
  WritePacket,
} from '../interfaces';
import {
  TcpOptions,
  TransportId,
} from '../interfaces/microservice-configuration.interface';
import { Server } from './server';

/**
 * 基于 TCP（net/tls 模块）的微服务服务端实现。
 *
 * 工作方式：
 * - 通过 net.createServer（或配置 tlsOptions 时的 tls.createServer）监听
 *   TCP 端口，每个新连接都会绑定 bindHandler；
 * - 收到消息后先反序列化为 ReadPacket，再按 pattern 查找
 *   @MessagePattern/@EventPattern 注册的处理器；
 * - 带 id 的消息是 RPC 请求：执行处理器并通过 send() 把响应
 *   序列化后从同一 socket 回发（附原始请求 id）；
 * - 不带 id 的消息是事件：走基类 handleEvent() 分发，不回发响应。
 *
 * @publicApi
 */
export class ServerTCP extends Server<TcpEvents, TcpStatus> {
  /** 传输器唯一标识：TCP。 */
  public transportId: TransportId = Transport.TCP;

  /** 底层 net/tls 服务器实例。 */
  protected server: NetSocket;
  /** 监听的端口号（默认 3000，见 TCP_DEFAULT_PORT）。 */
  protected readonly port: number;
  /** 监听的主机地址（默认 localhost）。 */
  protected readonly host: string;
  /** TCP socket 包装类，默认 JsonSocket（按 JSON + 帧长度协议收发消息）。 */
  protected readonly socketClass: Type<TcpSocket>;
  /** 单条消息的最大缓冲区字节数（仅 JsonSocket 使用，防止超大包攻击）。 */
  protected readonly maxBufferSize?: number;
  /** 是否由用户主动调用 close() 关闭（区分意外断开，决定是否重试）。 */
  protected isManuallyTerminated = false;
  /** 当前已经历的服务器重试启动次数。 */
  protected retryAttemptsCount = 0;
  /** TLS 选项，配置后使用 tls.createServer 创建加密服务器。 */
  protected tlsOptions?: TlsOptions;
  /** 服务器尚未初始化时暂存的事件监听器，init() 后统一注册。 */
  protected pendingEventListeners: Array<{
    event: keyof TcpEvents;
    callback: TcpEvents[keyof TcpEvents];
  }> = [];

  /**
   * @param options TCP 传输选项（host、port、retryAttempts、retryDelay、
   * socketClass、tlsOptions、maxBufferSize、序列化器/反序列化器等）
   */
  constructor(private readonly options: Required<TcpOptions>['options']) {
    super();
    // 1. 从选项中读取配置，未配置时使用内置默认值
    this.port = this.getOptionsProp(options, 'port', TCP_DEFAULT_PORT);
    this.host = this.getOptionsProp(options, 'host', TCP_DEFAULT_HOST);
    this.socketClass = this.getOptionsProp(options, 'socketClass', JsonSocket);
    this.tlsOptions = this.getOptionsProp(options, 'tlsOptions');
    this.maxBufferSize = this.getOptionsProp(options, 'maxBufferSize');

    // 2. 创建底层 net/tls 服务器并注册监听/错误/关闭事件
    this.init();
    // 3. 初始化序列化器与反序列化器（未配置时使用默认实现）
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /**
   * 开始监听 TCP 端口（由 microservices 应用启动时调用）。
   * @param callback 监听完成或出错（端口被占用/连接被拒绝）后调用的回调
   */
  public listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    // 1. 监听一次性的错误事件：端口占用（EADDRINUSE）或连接被拒（ECONNREFUSED）时直接回调错误
    this.server.once(TcpEventsMap.ERROR, (err: Record<string, unknown>) => {
      if (err?.code === EADDRINUSE || err?.code === ECONNREFUSED) {
        this._status$.next(TcpStatus.DISCONNECTED);

        return callback(err);
      }
    });
    // 2. 在指定端口与主机上启动监听
    this.server.listen(this.port, this.host, callback as () => void);
  }

  /**
   * 关闭 TCP 服务器（由应用优雅停机时调用）。
   * 标记为手动关闭，避免 handleClose() 触发自动重试。
   */
  public close() {
    this.isManuallyTerminated = true;

    this.server.close();
    this.pendingEventListeners = [];
  }

  /**
   * 为每个新建立的客户端连接绑定消息处理逻辑。
   * @param socket 新连接的原始 TCP socket
   */
  public bindHandler(socket: Socket) {
    // 1. 把原始 socket 包装为 TcpSocket（默认 JsonSocket，处理粘包/分包）
    const readSocket = this.getSocketInstance(socket);
    // 2. 收到消息时交给 handleMessage 处理
    readSocket.on('message', async (msg: ReadPacket & PacketId) =>
      this.handleMessage(readSocket, msg),
    );
    // 3. 接收数据异常（如 JSON 解析失败）时包装为 InvalidTcpDataReceptionException 记录
    readSocket.on(TcpEventsMap.ERROR, err => {
      const invalidError = new InvalidTcpDataReceptionException(err);
      this.handleError(invalidError as any);
    });
  }

  /**
   * 处理单条入站 TCP 消息（核心分发逻辑）。
   * @param socket 收到消息的 TcpSocket（用于回发响应）
   * @param rawMessage 原始消息（尚未反序列化）
   */
  public async handleMessage(socket: TcpSocket, rawMessage: unknown) {
    // 1. 反序列化得到 ReadPacket（含 pattern 与 data）
    const packet = await this.deserializer.deserialize(rawMessage);
    // 2. 把 pattern 统一转为字符串作为路由键
    const pattern = !isString(packet.pattern)
      ? JSON.stringify(packet.pattern)
      : packet.pattern;

    // 3. 构造 TCP 上下文（携带 socket 与 pattern，供处理器内部访问）
    const tcpContext = new TcpContext([socket, pattern]);
    // 4. 消息没有 id 说明是事件消息（@EventPattern）：走基类事件分发，不回发响应
    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(pattern, packet, tcpContext);
    }

    // 5. 带 id 的 RPC 请求：查找处理器，找不到则回发 error 响应（附原 id）
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      const status = 'error';
      const noHandlerPacket = this.serializer.serialize({
        id: (packet as IncomingRequest).id,
        status,
        err: NO_MESSAGE_HANDLER,
      });
      return socket.sendMessage(noHandlerPacket);
    }
    // 6. 执行处理器：结果统一转为 Observable，经 send() 串行回发，
    //    回发前把请求 id 附加到响应包并序列化
    return this.onProcessingStartHook(
      this.transportId,
      tcpContext,
      async () => {
        const response$ = this.transformToObservable(
          await handler(packet.data, tcpContext),
        );

        response$ &&
          this.send(response$, data => {
            Object.assign(data, { id: (packet as IncomingRequest).id });
            const outgoingResponse = this.serializer.serialize(
              data as WritePacket & PacketId,
            );

            this.onProcessingEndHook?.(this.transportId, tcpContext);
            socket.sendMessage(outgoingResponse);
          });
      },
    );
  }

  /**
   * 服务器意外关闭时的处理：若非手动关闭且未超过 retryAttempts 次数上限，
   * 则按 retryDelay 延迟后自动重新监听（重连自愈）。
   * @returns 重试定时器（无需重试时返回 undefined）
   */
  public handleClose(): undefined | number | NodeJS.Timer {
    if (
      this.isManuallyTerminated ||
      !this.getOptionsProp(this.options, 'retryAttempts') ||
      this.retryAttemptsCount >=
        this.getOptionsProp(this.options, 'retryAttempts', 0)
    ) {
      // 1. 手动关闭 / 未配置重试 / 已达重试上限：不再重试
      return undefined;
    }
    // 2. 计数 +1，并在延迟后重新监听同一端口与主机
    ++this.retryAttemptsCount;
    return setTimeout(
      () => this.server.listen(this.port, this.host),
      this.getOptionsProp(this.options, 'retryDelay', 0),
    );
  }

  /**
   * 暴露底层 net/tls 服务器实例。
   * @returns 底层服务器实例
   * @throws 未初始化（尚未调用 listen/startAllMicroservices）时抛出错误
   */
  public unwrap<T>(): T {
    if (!this.server) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return this.server as T;
  }

  /**
   * 注册底层服务器事件监听器（如 listening、error、close）。
   * 服务器尚未创建时先暂存，init() 完成后自动补注册。
   * @param event 事件名
   * @param callback 事件回调
   */
  public on<
    EventKey extends keyof TcpEvents = keyof TcpEvents,
    EventCallback extends TcpEvents[EventKey] = TcpEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.server) {
      this.server.on(event, callback as any);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  /**
   * 创建底层服务器并注册内置事件监听器。
   * 配置了 tlsOptions 时创建 TLS 服务器，否则创建普通 net 服务器。
   */
  protected init() {
    if (this.tlsOptions) {
      // TLS enabled, use tls server
      // 1. 启用 TLS：创建 tls 服务器，每个安全连接仍交给 bindHandler 处理
      this.server = tlsCreateServer(
        this.tlsOptions,
        this.bindHandler.bind(this),
      );
    } else {
      // TLS disabled, use net server
      // 2. 未启用 TLS：创建普通 net 服务器
      this.server = net.createServer(this.bindHandler.bind(this));
    }
    // 3. 注册监听成功、错误、关闭三类内置事件监听器
    this.registerListeningListener(this.server);
    this.registerErrorListener(this.server);
    this.registerCloseListener(this.server);

    // 4. 补注册 init 之前暂存的事件监听器并清空暂存列表
    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.server.on(event, callback),
    );
    this.pendingEventListeners = [];
  }

  /**
   * 注册「监听成功」事件监听器：listening 时把状态置为 CONNECTED。
   * @param socket 底层服务器实例
   */
  protected registerListeningListener(socket: net.Server) {
    socket.on(TcpEventsMap.LISTENING, () => {
      this._status$.next(TcpStatus.CONNECTED);
    });
  }

  /**
   * 注册「错误」事件监听器：连接被拒时状态置为 DISCONNECTED，并记录错误日志。
   * @param socket 底层服务器实例
   */
  protected registerErrorListener(socket: net.Server) {
    socket.on(TcpEventsMap.ERROR, err => {
      if ('code' in err && err.code === ECONNREFUSED) {
        this._status$.next(TcpStatus.DISCONNECTED);
      }
      this.handleError(err as any);
    });
  }

  /**
   * 注册「关闭」事件监听器：close 时状态置为 DISCONNECTED，并尝试自动重试。
   * @param socket 底层服务器实例
   */
  protected registerCloseListener(socket: net.Server) {
    socket.on(TcpEventsMap.CLOSE, () => {
      this._status$.next(TcpStatus.DISCONNECTED);
      this.handleClose();
    });
  }

  /**
   * 创建 TcpSocket 包装实例。
   * @param socket 原始 TCP socket
   * @returns 包装后的 TcpSocket 实例
   */
  protected getSocketInstance(socket: Socket): TcpSocket {
    // Pass maxBufferSize only if socketClass is JsonSocket
    // For custom socket classes, users should handle maxBufferSize in their own implementation
    // 仅当使用默认 JsonSocket 时传递 maxBufferSize；
    // 自定义 socketClass 时由用户自行处理该选项
    if (this.maxBufferSize !== undefined && this.socketClass === JsonSocket) {
      return new this.socketClass(socket, {
        maxBufferSize: this.maxBufferSize,
      });
    }
    return new this.socketClass(socket);
  }
}
