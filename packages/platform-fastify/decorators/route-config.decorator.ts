import { SetMetadata } from '@nestjs/common';
import { FASTIFY_ROUTE_CONFIG_METADATA } from '../constants';

/**
 * 路由配置装饰器：为 Fastify 路由附加自定义 config 对象，
 * 该配置可在 Fastify 的 onRequest/preHandler 等钩子中通过
 * request.routeOptions.config 读取（如做权限校验、打标等）。
 *
 * @param config - Fastify 路由配置对象
 *   See {@link https://fastify.dev/docs/latest/Reference/Routes/#config}
 * @publicApi
 */
export const RouteConfig = (config: any) =>
  SetMetadata(FASTIFY_ROUTE_CONFIG_METADATA, config);
