import { PipeTransform, Type } from '@nestjs/common';
import { RpcParamtype } from '../enums/rpc-paramtype.enum';
import { createPipesRpcParamDecorator } from '../utils/param.utils';

/**
 * 微服务消息负载（payload）参数装饰器：把消息数据注入到处理器参数中。
 * 写入 PARAM_ARGS_METADATA 元数据（RpcParamtype.PAYLOAD），
 * 由 RpcContextCreator 在调用处理器时取值并应用管道。
 *
 * @returns 参数装饰器
 * @publicApi
 */
export function Payload(): ParameterDecorator;
/**
 * 微服务消息负载参数装饰器（可指定管道）。
 *
 * 示例：
 * ```typescript
 * create(@Payload(new ValidationPipe()) createDto: CreateCatDto)
 * ```
 * @param pipes - 应用于该参数的一个或多个管道（实例或类）
 *
 * @publicApi
 */
export function Payload(
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
/**
 * 微服务消息负载参数装饰器：从 payload 对象中提取属性，也可对参数应用管道。
 *
 * 提取整个 payload：
 * ```typescript
 * findMany(@Payload() ids: string[])
 * ```
 *
 * 提取单个属性：
 * ```typescript
 * create(@Payload('data') createDto: { data: string })
 * ```
 *
 * 提取单个属性并应用管道：
 * ```typescript
 * create(@Payload('data', new ValidationPipe()) createDto: { data: string })
 * ```
 * @param propertyKey - 要从消息负载中提取的属性名
 * @param pipes - 应用于该参数的一个或多个管道（实例或类）
 *
 * @publicApi
 */
export function Payload(
  propertyKey?: string,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
export function Payload(
  propertyOrPipe?: string | (Type<PipeTransform> | PipeTransform),
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator {
  return createPipesRpcParamDecorator(RpcParamtype.PAYLOAD)(
    propertyOrPipe,
    ...pipes,
  );
}
