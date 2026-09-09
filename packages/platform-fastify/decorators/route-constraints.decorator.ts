import { SetMetadata } from '@nestjs/common';
import { FASTIFY_ROUTE_CONSTRAINTS_METADATA } from '../constants';
import { RouteShorthandOptions } from 'fastify';

/**
 * 路由约束装饰器：为 Fastify 路由声明 find-my-way 约束
 * （如基于 host、version 或自定义约束的路由匹配规则）。
 * FastifyAdapter 会把该元数据合并到路由的 constraints 选项中。
 *
 * @param config - Fastify 路由约束对象
 *   See {@link https://fastify.dev/docs/latest/Reference/Routes/#constraints}
 * @publicApi
 */
export const RouteConstraints = (
  config: RouteShorthandOptions['constraints'],
) => SetMetadata(FASTIFY_ROUTE_CONSTRAINTS_METADATA, config);
