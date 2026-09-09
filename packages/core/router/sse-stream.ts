import { MessageEvent } from '@nestjs/common/interfaces';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { IncomingMessage, OutgoingHttpHeaders } from 'http';
import { Transform } from 'stream';

// 把消息数据序列化为 SSE 的 data 字段格式：对象转 JSON，并按行拆分
// 每行加 "data: " 前缀（SSE 协议要求每行都有独立前缀）
function toDataString(data: string | object): string {
  if (isObject(data)) {
    return toDataString(JSON.stringify(data));
  }

  return data
    .split(/\r\n|\r|\n/)
    .map(line => `data: ${line}\n`)
    .join('');
}

/**
 * 附加响应头类型：可向 SSE 响应追加的自定义头（支持字符串数组、字符串、数字等）。
 */
export type AdditionalHeaders = Record<
  string,
  string[] | string | number | undefined
>;

/** 可读取响应头的流接口（如 Express 的 res 提供 getHeaders）。 */
interface ReadHeaders {
  getHeaders?(): AdditionalHeaders;
}

/** 可写入响应头的流接口（兼容 Express/Fastify 的 res）。 */
interface WriteHeaders {
  writableEnded?: boolean;
  writeHead?(
    statusCode: number,
    reasonPhrase?: string,
    headers?: OutgoingHttpHeaders,
  ): void;
  writeHead?(statusCode: number, headers?: OutgoingHttpHeaders): void;
  flushHeaders?(): void;
}

/** 可写入响应头（且可判定是否已结束）的可写流类型。 */
export type WritableHeaderStream = NodeJS.WritableStream & WriteHeaders;
/** 同时支持读/写响应头的流类型（即完整的 HTTP 响应对象抽象）。 */
export type HeaderStream = WritableHeaderStream & ReadHeaders;

/**
 * Adapted from https://raw.githubusercontent.com/EventSource/node-ssestream
 * Transforms "messages" to W3C event stream content.
 * See https://html.spec.whatwg.org/multipage/server-sent-events.html
 * A message is an object with one or more of the following properties:
 * - data (String or object, which gets turned into JSON)
 * - type
 * - id
 * - retry
 *
 * If constructed with a HTTP Request, it will optimise the socket for streaming.
 * If this stream is piped to an HTTP Response, it will set appropriate headers.
 */
export class SseStream extends Transform {
  private lastEventId: number | null = null;
  private _headersCommitted = false;
  private _destination: WritableHeaderStream | null = null;
  private _statusCode = 200;
  private _additionalHeaders: AdditionalHeaders | undefined;

  /**
   * @param req - HTTP 请求对象；提供时会优化底层 socket 以适合流式传输
   *              （开启 keep-alive、禁用 Nagle、关闭超时）。
   */
  constructor(req?: IncomingMessage) {
    super({ objectMode: true });
    if (req && req.socket) {
      req.socket.setKeepAlive(true);
      req.socket.setNoDelay(true);
      req.socket.setTimeout(0);
    }
  }

  /** 响应头是否已提交（一旦写出状态码就不可再更改）。 */
  get headersCommitted(): boolean {
    return this._headersCommitted;
  }

  /**
   * 把 SSE 流接入目标可写流（HTTP 响应），并记录状态码与附加响应头配置。
   *
   * @param destination - 目标可写流（响应对象）。
   * @param options - 可选配置：附加响应头、状态码、是否结束时关闭目标流。
   * @returns 目标可写流本身（保持 pipe 的链式语义）。
   */
  pipe<T extends WritableHeaderStream>(
    destination: T,
    options?: {
      additionalHeaders?: AdditionalHeaders;
      statusCode?: number;
      end?: boolean;
    },
  ): T {
    this._destination = destination;
    this._statusCode = options?.statusCode ?? 200;
    this._additionalHeaders = options?.additionalHeaders;
    return super.pipe(destination, options);
  }

  /**
   * Writes SSE headers to the destination if they have not been sent yet.
   * Headers are deferred until the first message so that, if the observable
   * errors before any data is emitted, the HTTP status code can still be
   * changed by an exception filter.
   */
  commitHeaders(): void {
    if (this._headersCommitted || !this._destination) {
      return;
    }
    if (this._destination.writableEnded) {
      return;
    }
    this._headersCommitted = true;
    const statusCode = this._statusCode ?? 200;
    const additionalHeaders = this._additionalHeaders;
    if (this._destination.writeHead) {
      this._destination.writeHead(statusCode, {
        ...additionalHeaders,
        // See https://github.com/dunglas/mercure/blob/master/hub/subscribe.go#L124-L130
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        // Disable cache, even for old browsers and proxies
        'Cache-Control':
          'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
        Pragma: 'no-cache',
        Expire: '0',
        // NGINX support https://www.nginx.com/resources/wiki/start/topics/examples/x-accel/#x-accel-buffering
        'X-Accel-Buffering': 'no',
      });
      this._destination.flushHeaders?.();
    }
    this._destination.write('\n');
  }

  /**
   * Transform 内部转换：把 MessageEvent 对象格式化为 SSE 文本
   * （event/id/retry/data 字段），并在首条消息前提交响应头。
   *
   * @param message - 待转换的事件消息。
   * @param encoding - 编码（objectMode 下不使用）。
   * @param callback - 转换完成回调。
   */
  _transform(
    message: MessageEvent,
    encoding: string,
    callback: (error?: Error | null, data?: any) => void,
  ) {
    // 1. 首条消息写入前提交 SSE 响应头（延迟提交便于异常过滤器修改状态码）
    this.commitHeaders();

    // 2. 清洗换行符的工具函数（SSE 协议要求字段值中不出现换行）
    const sanitize = (val: string | number) =>
      String(val).replace(/[\r\n]/g, '');

    // 3. 拼接 event/id/retry/data 字段，格式化后推入下游流
    let data = message.type ? `event: ${sanitize(message.type)}\n` : '';
    data +=
      message.id !== undefined && message.id !== null
        ? `id: ${sanitize(message.id)}\n`
        : '';
    data += message.retry ? `retry: ${sanitize(message.retry)}\n` : '';
    data += message.data ? toDataString(message.data) : '';
    data += '\n';
    this.push(data);
    callback();
  }

  /**
   * Calls `.write` but handles the drain if needed
   */
  writeMessage(
    message: MessageEvent,
    cb: (error: Error | null | undefined) => void,
  ) {
    if (message.id === undefined || message.id === null) {
      this.lastEventId!++;
      message.id = this.lastEventId!.toString();
    }

    if (!this.write(message, 'utf-8')) {
      this.once('drain', cb);
    } else {
      process.nextTick(cb);
    }
  }
}
