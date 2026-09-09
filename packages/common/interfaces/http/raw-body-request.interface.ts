/**
 * 在原始请求对象上扩展 `rawBody` 属性的类型。
 * 当 `NestFactory.create()` 传入 `rawBody: true` 时，请求对象会被赋予原始请求体（Buffer），
 * 可通过 `req.rawBody` 访问（常用于自行校验 Webhook 签名）。
 *
 * @publicApi
 */
export type RawBodyRequest<T> = T & { rawBody?: Buffer };
