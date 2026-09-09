import { PipeTransform, Type } from '@nestjs/common';
import { WsParamtype } from '../enums/ws-paramtype.enum';
import { createPipesWsParamDecorator } from '../utils/param.utils';

/**
 * WebSockets message body parameter decorator.
 *
 * @publicApi
 */
export function MessageBody(): ParameterDecorator;
/**
 * WebSockets message body parameter decorator.
 *
 * Example:
 * ```typescript
 * create(@MessageBody(new ValidationPipe()) createDto: CreateCatDto)
 * ```
 * @param pipes one or more pipes - either instances or classes - to apply to
 * the bound parameter.
 *
 * @publicApi
 */
export function MessageBody(
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
/**
 * WebSockets message body parameter decorator. Extracts a property from the
 * message payload object. May also apply pipes to the bound parameter.
 *
 * For example, extracting all params:
 * ```typescript
 * findMany(@MessageBody() ids: string[])
 * ```
 *
 * For example, extracting a single param:
 * ```typescript
 * create(@MessageBody('data') createDto: { data: string })
 * ```
 *
 * For example, extracting a single param with pipe:
 * ```typescript
 * create(@MessageBody('data', new ValidationPipe()) createDto: { data: string })
 * ```
 * @param propertyKey name of single property to extract from the message payload
 * @param pipes one or more pipes - either instances or classes - to apply to
 * the bound parameter.
 *
 * @publicApi
 */
export function MessageBody(
  propertyKey: string,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
export function MessageBody(
  propertyOrPipe?: string | (Type<PipeTransform> | PipeTransform),
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator {
  // 实现签名：区分三种重载（无参/管道列表/属性名+管道列表），
  // 统一委托给 createPipesWsParamDecorator(WsParamtype.PAYLOAD)，
  // 即从运行时参数第 1 位（消息负载）中提取值。
  return createPipesWsParamDecorator(WsParamtype.PAYLOAD)(
    propertyOrPipe,
    ...pipes,
  );
}
