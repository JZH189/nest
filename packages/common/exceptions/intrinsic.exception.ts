/**
 * 表示应用程序内在错误的异常。
 * 当抛出时，默认异常过滤器不会记录错误消息。
 *
 * @publicApi
 */
export class IntrinsicException extends Error {}
