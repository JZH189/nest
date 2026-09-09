import { Buffer } from 'buffer';
import { Socket } from 'net';
import { InvalidJSONFormatException } from '../errors/invalid-json-format.exception';
import { NetSocketClosedException } from '../errors/net-socket-closed.exception';
import { TcpEventsMap } from '../events/tcp.events';

/**
 * TCP Socket 抽象基类：对 net.Socket 的轻量封装，统一处理连接状态
 * 跟踪、收发消息的调度与错误传播。子类（如 JsonSocket）实现具体的
 * 帧编码（handleSend）与帧解析（handleData）逻辑。
 */
export abstract class TcpSocket {
  private isClosed = false;

  /** 暴露底层原生 net.Socket，便于外部直接监听原生事件 */
  public get netSocket() {
    return this.socket;
  }

  /**
   * @param socket - 底层原生 TCP socket；构造时挂接数据/连接/关闭/错误监听
   */
  constructor(public readonly socket: Socket) {
    this.socket.on('data', this.onData.bind(this));
    this.socket.on(TcpEventsMap.CONNECT, () => (this.isClosed = false));
    this.socket.on(TcpEventsMap.CLOSE, () => (this.isClosed = true));
    this.socket.on(TcpEventsMap.ERROR, () => (this.isClosed = true));
  }

  /**
   * 连接到指定主机与端口。
   * @param port - 目标端口
   * @param host - 目标主机名或 IP
   * @returns 当前实例（支持链式调用）
   */
  public connect(port: number, host: string) {
    this.socket.connect(port, host);
    return this;
  }

  /**
   * 在底层 socket 上注册事件监听器。
   * @param event - 事件名
   * @param callback - 事件回调
   * @returns 当前实例（支持链式调用）
   */
  public on(event: string, callback: (err?: any) => void) {
    this.socket.on(event, callback);
    return this;
  }

  /**
   * 在底层 socket 上注册一次性事件监听器（触发一次后自动移除）。
   * @param event - 事件名
   * @param callback - 事件回调
   * @returns 当前实例（支持链式调用）
   */
  public once(event: string, callback: (err?: any) => void) {
    this.socket.once(event, callback);
    return this;
  }

  /**
   * 半关闭连接（发送 FIN，之后不再发送数据）。
   * @returns 当前实例（支持链式调用）
   */
  public end() {
    this.socket.end();
    return this;
  }

  /**
   * 发送消息；若连接已关闭则通过回调返回错误而不发送。
   * @param message - 待发送的消息对象
   * @param callback - 发送完成或失败后的回调
   */
  public sendMessage(message: any, callback?: (err?: any) => void) {
    // 1. 连接已关闭：不发送，直接回调抛出连接关闭异常
    if (this.isClosed) {
      callback && callback(new NetSocketClosedException());
      return;
    }
    this.handleSend(message, callback);
  }

  /** 子类实现：按具体帧协议把消息写入底层 socket */
  protected abstract handleSend(
    message: any,
    callback?: (err?: any) => void,
  ): any;

  /**
   * 底层 data 事件的统一入口；解析出错时向外触发 error 事件并关闭连接。
   * @param data - socket 收到的原始字节
   */
  private onData(data: Buffer) {
    try {
      this.handleData(data);
    } catch (e) {
      this.socket.emit(TcpEventsMap.ERROR, e.message);
      this.socket.end();
    }
  }

  /** 子类实现：解析底层字节流并按帧切分出完整消息 */
  protected abstract handleData(data: Buffer | string): any;

  /**
   * 把已切分出的完整 JSON 帧解析为对象，并以 'message' 事件向外分发。
   * @param data - 完整消息帧（JSON 字符串）
   * @throws InvalidJSONFormatException - 帧内容不是合法 JSON 时抛出
   */
  protected emitMessage(data: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data);
    } catch (e) {
      throw new InvalidJSONFormatException(e, data);
    }
    message = message || {};
    this.socket.emit('message', message);
  }
}
