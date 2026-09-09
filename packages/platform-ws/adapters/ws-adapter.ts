import { INestApplicationContext, Logger } from '@nestjs/common';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isNil, normalizePath } from '@nestjs/common/utils/shared.utils';
import { AbstractWsAdapter } from '@nestjs/websockets';
import {
  CLOSE_EVENT,
  CONNECTION_EVENT,
  ERROR_EVENT,
} from '@nestjs/websockets/constants';
import { MessageMappingProperties } from '@nestjs/websockets/gateway-metadata-explorer';
import * as http from 'http';
import { EMPTY, fromEvent, Observable } from 'rxjs';
import { filter, first, mergeMap, share, takeUntil } from 'rxjs/operators';

let wsPackage: any = {};

/** ws 库 WebSocket 的 readyState 常量，用于发送消息前确认连接可用 */
enum READY_STATE {
  CONNECTING_STATE = 0,
  OPEN_STATE = 1,
  CLOSING_STATE = 2,
  CLOSED_STATE = 3,
}

/** HTTP 服务器注册表的键：端口号 */
type HttpServerRegistryKey = number;
/** HTTP 服务器注册表的值：http.Server 实例 */
type HttpServerRegistryEntry = any;
/** ws 服务器注册表的键：端口号 */
type WsServerRegistryKey = number;
/** ws 服务器注册表的值：该端口下的多个 ws 服务器（不同路径） */
type WsServerRegistryEntry = any[];
/** ws 层传输的数据形态：文本或二进制 */
type WsData = string | Buffer | ArrayBuffer | Buffer[];
/**
 * 消息解析器：把 ws 原始消息解析为 { event, data } 事件结构；
 * 返回 void 表示无法解析/忽略该消息。可通过构造选项或
 * setMessageParser 自定义（如支持二进制协议）。
 */
type WsMessageParser = (data: WsData) => { event: string; data: any } | void;
/** WsAdapter 的可配置选项 */
type WsAdapterOptions = {
  messageParser?: WsMessageParser;
};

/** 特殊端口标记：表示 ws 服务器应挂载到应用自身的 HTTP 服务器上 */
const UNDERLYING_HTTP_SERVER_PORT = 0;

/**
 * @publicApi
 *
 * ws 库（原生 WebSocket）平台的适配器：包装 ws 的 Server/客户端连接，
 * 供 @WebSocketGateway() 装饰的网关使用（通过
 * `app.useWebSocketAdapter(new WsAdapter(app))` 启用）。
 * 与 socket.io 不同，ws 协议不支持命名空间，消息需按
 * JSON 的 { event, data } 结构自行分发。
 *
 * 核心职责：
 * 1. create：按端口/路径/已有 server 创建 ws.Server，并维护
 *    "端口 -> HTTP 服务器" 与 "端口 -> ws 服务器列表" 两张注册表；
 * 2. bindMessageHandlers：解析 JSON 消息并按 event 名称分发到
 *    @SubscribeMessage 声明的处理器，结果以 JSON 回发；
 * 3. close/dispose：关闭连接与释放所有注册的服务器资源。
 */
export class WsAdapter extends AbstractWsAdapter {
  protected readonly logger = new Logger(WsAdapter.name);
  /** 端口 -> HTTP 服务器注册表（ws 的 upgrade 请求由它统一处理） */
  protected readonly httpServersRegistry = new Map<
    HttpServerRegistryKey,
    HttpServerRegistryEntry
  >();
  /** 端口 -> ws 服务器列表注册表（同端口不同路径的多个网关） */
  protected readonly wsServersRegistry = new Map<
    WsServerRegistryKey,
    WsServerRegistryEntry
  >();
  /** 默认消息解析器：把消息按 JSON 解析为 { event, data } */
  protected messageParser: WsMessageParser = (data: WsData) => {
    return JSON.parse(data.toString());
  };

  /**
   * @param appOrHttpServer - 应用上下文或 HTTP 服务器实例；传入 0 端口时
   *                          ws 服务器将挂载到该 HTTP 服务器上。
   * @param options - 可选配置，目前支持自定义 messageParser。
   */
  constructor(
    appOrHttpServer?: INestApplicationContext | object,
    options?: WsAdapterOptions,
  ) {
    super(appOrHttpServer);
    // 动态加载 ws 包（peer dependency），避免硬性依赖
    wsPackage = loadPackage('ws', 'WsAdapter', () => require('ws'));

    if (options?.messageParser) {
      this.messageParser = options.messageParser;
    }
  }

  /**
   * 创建 ws 服务器实例（网关初始化时由框架调用）。
   * 处理四种场景：
   * 1. 指定 namespace —— ws 不支持，直接抛错（提示改用 platform-socket.io）；
   * 2. port 为 0 且有 httpServer —— 复用应用 HTTP 服务器（noServer 模式），
   *    按路径注册以便 upgrade 时分发；
   * 3. 传入 server —— 直接复用；
   * 4. 指定 path 且独立端口 —— 先确保 HTTP 服务器存在并监听，
   *    再以 noServer 模式创建 ws 服务器并按路径注册；
   * 5. 其余情况直接按端口/路径创建独立 ws 服务器。
   *
   * @param port - 监听端口；0 表示挂载到应用自身 HTTP 服务器。
   * @param options - ws 选项，附加支持 namespace/server/path 字段。
   * @returns 创建（或复用）的 ws 服务器实例。
   */
  public create(
    port: number,
    options?: Record<string, any> & {
      namespace?: string;
      server?: any;
      path?: string;
    },
  ) {
    const { server, path, ...wsOptions } = options as {
      namespace?: string;
      server?: any;
      path?: string;
    };
    if (wsOptions?.namespace) {
      const error = new Error(
        '"WsAdapter" does not support namespaces. If you need namespaces in your project, consider using the "@nestjs/platform-socket.io" package instead.',
      );
      this.logger.error(error);
      throw error;
    }

    if (port === UNDERLYING_HTTP_SERVER_PORT && this.httpServer) {
      // 与 Nest HTTP 应用共用同一个 HTTP 服务器
      this.ensureHttpServerExists(port, this.httpServer);
      const wsServer = this.bindErrorHandler(
        new wsPackage.Server({
          noServer: true,
          ...wsOptions,
        }),
      );

      this.addWsServerToRegistry(wsServer, port, path!);
      return wsServer;
    }

    if (server) {
      return server;
    }
    if (path && port !== UNDERLYING_HTTP_SERVER_PORT) {
      // Multiple servers with different paths
      // sharing a single HTTP/S server running on different port
      // than a regular HTTP application
      const httpServer = this.ensureHttpServerExists(port);
      httpServer?.listen(port);

      const wsServer = this.bindErrorHandler(
        new wsPackage.Server({
          noServer: true,
          ...wsOptions,
        }),
      );
      this.addWsServerToRegistry(wsServer, port, path);
      return wsServer;
    }
    const wsServer = this.bindErrorHandler(
      new wsPackage.Server({
        port,
        path,
        ...wsOptions,
      }),
    );
    return wsServer;
  }

  /**
   * 把消息处理器绑定到客户端连接：ws 只有一个 'message' 事件，
   * 因此先建 "event 名 -> handler" 映射，收到消息后解析 JSON 并分发。
   *
   * 流程：
   * 1. 构建处理器映射表，并监听 close 事件生成 close$ 完成信号；
   * 2. 订阅 message 事件流：每条消息经 bindMessageHandler 解析、分发、
   *    执行并过滤空结果，close$ 触发时自动取消订阅（takeUntil）；
   * 3. 回发：仅在连接处于 OPEN 状态时把结果序列化为 JSON 发送。
   *
   * @param client - 客户端 WebSocket 连接。
   * @param handlers - 网关中声明的消息处理器集合。
   * @param transform - 把处理方法返回值转换为 Observable 的适配函数。
   */
  public bindMessageHandlers(
    client: any,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ) {
    const handlersMap = new Map<string, MessageMappingProperties>();
    handlers.forEach(handler => handlersMap.set(handler.message, handler));

    const close$ = fromEvent(client, CLOSE_EVENT).pipe(share(), first());
    const source$ = fromEvent(client, 'message').pipe(
      mergeMap(data =>
        this.bindMessageHandler(data, handlersMap, transform).pipe(
          filter(result => !isNil(result)),
        ),
      ),
      takeUntil(close$),
    );
    const onMessage = (response: any) => {
      if (client.readyState !== READY_STATE.OPEN_STATE) {
        return;
      }
      client.send(JSON.stringify(response));
    };
    source$.subscribe(onMessage);
  }

  /**
   * 处理单条消息：解析出 event 与 data，查找对应处理器并调用，
   * 返回处理结果的 Observable；解析失败或无对应处理器时返回 EMPTY。
   *
   * @param buffer - 原始消息对象（buffer.data 为消息内容）。
   * @param handlersMap - event 名 -> 处理器的映射表。
   * @param transform - 结果转 Observable 的适配函数。
   * @returns 处理结果流（可能为 EMPTY）。
   */
  public bindMessageHandler(
    buffer: any,
    handlersMap: Map<string, MessageMappingProperties>,
    transform: (data: any) => Observable<any>,
  ): Observable<any> {
    try {
      const message = this.messageParser(buffer.data);
      if (!message) {
        return EMPTY;
      }
      const messageHandler = handlersMap.get(message.event)!;
      const { callback } = messageHandler;
      return transform(callback(message.data, message.event));
    } catch {
      return EMPTY;
    }
  }

  /**
   * 给服务器绑定错误处理：服务器级错误与每个连接上的错误都记录到日志。
   *
   * @param server - ws 服务器实例。
   * @returns 同一个服务器实例（便于链式使用）。
   */
  public bindErrorHandler(server: any) {
    server.on(CONNECTION_EVENT, (ws: any) =>
      ws.on(ERROR_EVENT, (err: any) => this.logger.error(err)),
    );
    server.on(ERROR_EVENT, (err: any) => this.logger.error(err));
    return server;
  }

  /**
   * 绑定客户端断开回调（供 @SubscribeMessage 之外的生命周期钩子使用）。
   *
   * @param client - 客户端连接。
   * @param callback - close 事件触发时执行的回调。
   */
  public bindClientDisconnect(client: any, callback: Function) {
    client.on(CLOSE_EVENT, callback);
  }

  /**
   * 关闭 ws 服务器：先终止所有活跃客户端连接，再等待服务器 close 回调。
   *
   * @param server - 待关闭的 ws 服务器。
   */
  public async close(server: any) {
    const closeEventSignal = new Promise((resolve, reject) =>
      server.close((err: Error) => (err ? reject(err) : resolve(undefined))),
    );
    for (const ws of server.clients) {
      ws.terminate();
    }
    await closeEventSignal;
  }

  /**
   * 释放适配器持有的全部资源：关闭所有非复用（独立端口）的 HTTP 服务器，
   * 并清空两张注册表。应用关闭时由框架调用。
   */
  public async dispose() {
    const closeEventSignals = Array.from(this.httpServersRegistry)
      .filter(([port]) => port !== UNDERLYING_HTTP_SERVER_PORT)
      .map(([_, server]) => new Promise(resolve => server.close(resolve)));

    await Promise.all(closeEventSignals);
    this.httpServersRegistry.clear();
    this.wsServersRegistry.clear();
  }

  /** 替换默认的 JSON 消息解析器（支持自定义协议） */
  public setMessageParser(parser: WsMessageParser) {
    this.messageParser = parser;
  }

  /**
   * 确保指定端口存在承载 ws 的 HTTP 服务器，并注册 'upgrade' 处理逻辑：
   * 根据 upgrade 请求的路径找到匹配的 ws 服务器执行 handleUpgrade，
   * 没有匹配的路径时销毁底层 socket，解析异常时返回 400。
   *
   * @param port - HTTP 服务器监听的端口。
   * @param httpServer - 可选的已有 HTTP 服务器，缺省时新建一个。
   * @returns 注册表中的 HTTP 服务器。
   */
  protected ensureHttpServerExists(
    port: number,
    httpServer = http.createServer(),
  ) {
    if (this.httpServersRegistry.has(port)) {
      return;
    }
    this.httpServersRegistry.set(port, httpServer);

    httpServer.on('upgrade', (request, socket, head) => {
      try {
        // 1. 从 upgrade 请求 URL 中解析出请求路径
        const baseUrl = 'ws://' + request.headers.host + '/';
        const pathname = new URL(request.url!, baseUrl).pathname;
        const wsServersCollection = this.wsServersRegistry.get(port)!;

        // 2. 在该端口注册的所有 ws 服务器中按路径分发 upgrade 请求
        let isRequestDelegated = false;
        for (const wsServer of wsServersCollection) {
          if (pathname === wsServer.path) {
            wsServer.handleUpgrade(request, socket, head, (ws: unknown) => {
              wsServer.emit('connection', ws, request);
            });
            isRequestDelegated = true;
            break;
          }
        }
        // 3. 没有匹配路径的请求直接销毁连接
        if (!isRequestDelegated) {
          socket.destroy();
        }
      } catch (err) {
        socket.end('HTTP/1.1 400\r\n' + err.message);
      }
    });
    return httpServer;
  }

  /**
   * 把 ws 服务器加入对应端口的注册表，并规范化其监听路径。
   *
   * @param wsServer - 带 path 字段的 ws 服务器实例。
   * @param port - 所属端口。
   * @param path - 网关声明的路径（如 @WebSocketGateway(8080, { path: '/chat' })）。
   */
  protected addWsServerToRegistry<T extends Record<'path', string> = any>(
    wsServer: T,
    port: number,
    path: string,
  ) {
    const entries = this.wsServersRegistry.get(port) ?? [];
    entries.push(wsServer);

    wsServer.path = normalizePath(path);
    this.wsServersRegistry.set(port, entries);
  }
}
