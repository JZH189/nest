import { Readable } from 'stream';
import { types } from 'util';
import { HttpStatus } from '../enums';
import { Logger } from '../services';
import { isFunction } from '../utils/shared.utils';
import { StreamableFileOptions, StreamableHandlerResponse } from './interfaces';

/**
 * 表示可通过 HTTP 响应以流的形式返回给客户端的文件。
 *
 * 在控制器方法中返回 `StreamableFile` 实例时，Nest 会绕过 JSON 序列化拦截器，
 * 直接把内部的可读流（或 Buffer）写入 HTTP 响应体，并依据选项设置
 * `Content-Type`、`Content-Disposition`、`Content-Length` 等响应头，
 * 适用于文件下载、图片、音视频等大内容的高效传输场景。
 *
 * @see [流式文件](https://docs.nestjs.cn/techniques/streaming-files)
 *
 * @publicApi
 */
export class StreamableFile {
  /** 内部持有的可读流，最终会被写入 HTTP 响应体 */
  private readonly stream: Readable;
  protected logger = new Logger('StreamableFile');

  /**
   * 默认的流错误处理器：当流式传输过程中发生错误时被调用。
   * 1. 若连接已销毁（客户端已断开），直接返回；
   * 2. 若响应头已发送，无法再更改状态码，只能调用 `end()` 结束响应；
   * 3. 否则将状态码设为 400，并把错误消息作为响应体发送。
   */
  protected handleError: (
    err: Error,
    response: StreamableHandlerResponse,
  ) => void = (err: Error, res) => {
    if (res.destroyed) {
      return;
    }
    if (res.headersSent) {
      res.end();
      return;
    }

    res.statusCode = HttpStatus.BAD_REQUEST;
    res.send(err.message);
  };

  /** 默认的错误日志记录器：将错误输出到 Nest 的 Logger */
  protected logError: (err: Error) => void = (err: Error) => {
    this.logger.error(err);
  };

  /**
   * 创建一个 `StreamableFile` 实例。
   *
   * @overload 传入 `Uint8Array`（字节数组）时，会被包装为内存中的可读流
   * @param buffer - 文件的字节数组
   * @param options - 可选的响应头选项（Content-Type 等）
   */
  constructor(buffer: Uint8Array, options?: StreamableFileOptions);
  /**
   * @overload 传入 Node.js 可读流时，直接以该流作为响应数据源
   * @param readable - 可读流（如 `fs.createReadStream()` 的返回值）
   * @param options - 可选的响应头选项（Content-Type 等）
   */
  constructor(readable: Readable, options?: StreamableFileOptions);
  constructor(
    bufferOrReadStream: Uint8Array | Readable,
    readonly options: StreamableFileOptions = {},
  ) {
    // 1. 传入的是字节数组：创建内存可读流，将数据推入后再推入 null 表示流结束
    if (types.isUint8Array(bufferOrReadStream)) {
      this.stream = new Readable();
      this.stream.push(bufferOrReadStream);
      this.stream.push(null);
      // 若未显式指定 length，则默认使用字节数组的长度作为 Content-Length
      this.options.length ??= bufferOrReadStream.length;
    } else if (bufferOrReadStream.pipe && isFunction(bufferOrReadStream.pipe)) {
      // 2. 传入的是可读流（通过是否具有 pipe 方法判断）：直接使用该流
      this.stream = bufferOrReadStream;
    }
  }

  /**
   * 获取内部的可读流。
   * @returns 将被写入 HTTP 响应体的可读流
   */
  getStream(): Readable {
    return this.stream;
  }

  /**
   * 根据选项计算流式响应应使用的响应头。
   * @returns 包含 `type`（Content-Type，默认 application/octet-stream）、
   * `disposition`（Content-Disposition）与 `length`（Content-Length）的对象
   */
  getHeaders() {
    const {
      type = 'application/octet-stream',
      disposition = undefined,
      length = undefined,
    } = this.options;
    return {
      type,
      disposition,
      length,
    };
  }

  /**
   * 获取当前生效的流错误处理器。
   * @returns 错误处理函数，接收错误对象与底层 HTTP 响应对象
   */
  get errorHandler(): (
    err: Error,
    response: StreamableHandlerResponse,
  ) => void {
    return this.handleError;
  }

  /**
   * 替换默认的流错误处理器。
   * @param handler - 自定义错误处理函数
   * @returns 当前 `StreamableFile` 实例，支持链式调用
   */
  setErrorHandler(
    handler: (err: Error, response: StreamableHandlerResponse) => void,
  ) {
    this.handleError = handler;
    return this;
  }

  /**
   * 获取当前生效的错误日志记录函数。
   * @returns 错误日志记录函数
   */
  get errorLogger() {
    return this.logError;
  }

  /**
   * 替换默认的错误日志记录函数。
   * @param handler - 自定义错误日志记录函数
   * @returns 当前 `StreamableFile` 实例，支持链式调用
   */
  setErrorLogger(handler: (err: Error) => void) {
    this.logError = handler;
    return this;
  }
}
