import { Buffer } from 'buffer';
import { StringDecoder } from 'string_decoder';
import { CorruptedPacketLengthException } from '../errors/corrupted-packet-length.exception';
import { MaxPacketLengthExceededException } from '../errors/max-packet-length-exceeded.exception';
import { TcpSocket } from './tcp-socket';

const DEFAULT_MAX_BUFFER_SIZE = (512 * 1024 * 1024) / 4; // 512 MBs in characters with 4 bytes per character (32-bit)

export interface JsonSocketOptions {
  /** 单次接收缓冲的最大字符数，超出即认为异常并丢弃数据（防止内存被撑爆） */
  maxBufferSize?: number;
}

/**
 * JSON Socket：TCP 之上的 JSON 消息帧协议实现。
 *
 * TCP 是字节流协议，没有消息边界，Nest 自定义了 `长度#JSON` 的帧格式：
 * 发送时把消息序列化为 JSON，并在前面附上"长度 + 分隔符 #"；
 * 接收时按分隔符解析出长度，再按长度切分出完整消息。
 * 该类同时负责防止粘包/拆包问题，以及限制缓冲区大小防止恶意攻击。
 */
export class JsonSocket extends TcpSocket {
  private contentLength: number | null = null;
  private buffer = '';

  private readonly stringDecoder = new StringDecoder();
  private readonly delimiter = '#';
  private readonly maxBufferSize: number;

  /**
   * @param socket - 底层 TCP socket 实例
   * @param options - 可选项，允许自定义 maxBufferSize
   */
  constructor(socket: any, options?: JsonSocketOptions) {
    super(socket);
    this.maxBufferSize = options?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
  }

  /**
   * 发送消息：按 `长度#JSON` 帧格式写入底层 socket。
   * @param message - 待发送的消息对象
   * @param callback - 写入完成（或失败）后的回调
   */
  protected handleSend(message: any, callback?: (err?: any) => void) {
    this.socket.write(this.formatMessageData(message), 'utf-8', callback);
  }

  /**
   * 接收数据：把收到的字节追加到缓冲区，循环切分出完整的消息帧。
   * @param dataRaw - socket 收到的原始数据（Buffer 或字符串）
   */
  protected handleData(dataRaw: Buffer | string) {
    // 1. Buffer 需先解码为字符串（StringDecoder 能正确处理多字节 UTF-8 跨包的情况）
    const data = Buffer.isBuffer(dataRaw)
      ? this.stringDecoder.write(dataRaw)
      : dataRaw;
    this.buffer += data;

    // Iterative loop replaces recursion to prevent stack overflow on pipelined
    // TCP messages (e.g. many small frames arriving in one read event).
    while (true) {
      // 2. 缓冲区超过上限视为恶意/异常流量，清空并抛错，防止内存被无限占用
      if (this.buffer.length > this.maxBufferSize) {
        const bufferLength = this.buffer.length;
        this.buffer = '';
        throw new MaxPacketLengthExceededException(bufferLength);
      }

      // 3. 尚未解析出当前帧的长度：查找分隔符 '#'，解析长度前缀
      if (this.contentLength === null) {
        const i = this.buffer.indexOf(this.delimiter);
        /**
         * Check if the buffer has the delimiter (#),
         * if not, the end of the buffer string might be in the middle of a content length string
         */
        // 4. 找不到分隔符说明长度前缀（甚至整帧）还没收全，等待更多数据
        if (i === -1) {
          break;
        }
        const rawContentLength = this.buffer.substring(0, i);
        this.contentLength = parseInt(rawContentLength, 10);

        // 5. 长度不是合法数字：帧已损坏，清空缓冲并抛错
        if (isNaN(this.contentLength)) {
          this.contentLength = null;
          this.buffer = '';
          throw new CorruptedPacketLengthException(rawContentLength);
        }
        // 6. 去掉长度前缀，剩下部分为消息体
        this.buffer = this.buffer.substring(i + 1);
      }

      // 7. 已知长度：按长度切分消息体
      if (this.contentLength !== null) {
        const length = this.buffer.length;
        if (length === this.contentLength) {
          this.handleMessage(this.buffer);
          // handleMessage resets contentLength and buffer; next iteration will break
        } else if (length > this.contentLength) {
          // 8. 缓冲里粘了多帧：切出当前帧分发给监听者，余量留到下一轮循环继续处理
          const message = this.buffer.substring(0, this.contentLength);
          const rest = this.buffer.substring(this.contentLength);
          this.handleMessage(message); // resets this.buffer to ''
          this.buffer = rest; // restore remaining data for next iteration
          continue;
        } else {
          // Incomplete message — wait for more data
          break;
        }
      } else {
        break;
      }
    }
  }

  /**
   * 分发一条完整消息：重置帧解析状态并向外触发 message 事件。
   * @param message - 已切分出的完整 JSON 字符串消息
   */
  private handleMessage(message: any) {
    this.contentLength = null;
    this.buffer = '';
    this.emitMessage(message);
  }

  /**
   * 把消息编码为 `长度#JSON` 帧格式的字符串。
   * @param message - 待发送的消息对象
   * @returns 形如 `23#{"pattern":...}` 的帧字符串
   */
  private formatMessageData(message: any) {
    const messageData = JSON.stringify(message);
    const length = messageData.length;
    const data = length + this.delimiter + messageData;
    return data;
  }
}
