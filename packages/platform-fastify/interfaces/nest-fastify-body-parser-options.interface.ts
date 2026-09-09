import type { AddContentTypeParser } from 'fastify';

/**
 * NestFastifyApplication.useBodyParser() 可接受的解析器选项类型。
 * 复用 Fastify 的 addContentTypeParser 选项，但移除了 parseAs 字段
 * （适配器内部强制固定为 'buffer'）。
 */
export type NestFastifyBodyParserOptions = Omit<
  Parameters<AddContentTypeParser>[1],
  'parseAs'
>;
