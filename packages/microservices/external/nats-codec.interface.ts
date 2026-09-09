/**
 * NATS 消息编解码器接口（第三方 nats.js 的类型声明镜像）：
 * 用于把任意类型的消息负载编码为可传输的 Uint8Array，以及反向解码。
 * NATS 客户端通过 JSONCodec/StringCodec 等实现该接口。
 *
 * @see https://github.com/nats-io/nats.js
 *
 * @publicApi
 * @typeParam T - 编解码的消息负载类型
 */
export interface NatsCodec<T> {
  /**
   * 把消息负载编码为可传输的二进制数据。
   * @param d 消息负载
   * @returns 编码后的二进制数据
   */
  encode(d: T): Uint8Array;
  /**
   * 把二进制数据解码为消息负载。
   * @param a 二进制数据
   * @returns 解码后的消息负载
   */
  decode(a: Uint8Array): T;
}
