import { SetMetadata } from '@nestjs/common';
import { FASTIFY_ROUTE_SCHEMA_METADATA } from '../constants';
import { FastifySchema } from 'fastify';

/**
 * 路由 Schema 装饰器：为 Fastify 路由声明 JSON Schema 校验规则，
 * 由 Fastify 在运行期对请求/响应做高性能校验。Schema 对象可包含：
 * - body: JsonSchema（请求体）
 * - querystring 或 query: JsonSchema（查询参数）
 * - params: JsonSchema（路径参数）
 * - response: Record<HttpStatusCode, JsonSchema>（各状态码的响应体）
 *
 * @param schema - Fastify 路由 schema 对象
 *   See {@link https://fastify.dev/docs/latest/Reference/Routes/#routes-options}
 * @publicApi
 */
export const RouteSchema = (schema: FastifySchema) =>
  SetMetadata(FASTIFY_ROUTE_SCHEMA_METADATA, schema);
