/**
 * 可用的 body 解析器类型联合，配合 `NestExpressApplication.useBodyParser()` 使用：
 * - json：解析 JSON 请求体
 * - urlencoded：解析表单编码请求体
 * - text：以纯文本读取请求体
 * - raw：以原始 Buffer 读取请求体
 */
export type NestExpressBodyParserType = 'json' | 'urlencoded' | 'text' | 'raw';
