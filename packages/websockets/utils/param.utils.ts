import { PipeTransform, Type } from '@nestjs/common';
import { assignMetadata } from '@nestjs/common/decorators/http/route-params.decorator';
import { isNil, isString } from '@nestjs/common/utils/shared.utils';
import 'reflect-metadata';
import { PARAM_ARGS_METADATA } from '../constants';
import { WsParamtype } from '../enums/ws-paramtype.enum';

/**
 * 创建 WebSocket 参数装饰器的工厂（不带数据参数的简化版）。
 *
 * 处理步骤：
 * 1. 返回一个接受管道列表的高阶函数（支持 @ConnectedSocket(...pipes) 形式）；
 * 2. 装饰器执行时读取方法上已有的 PARAM_ARGS_METADATA 参数元数据；
 * 3. 用 assignMetadata 把 {paramtype, index, pipes} 追加进元数据后写回，
 *    供 WsContextCreator 在构造上下文时解析。
 *
 * @param paramtype - 参数类型（SOCKET/PAYLOAD/ACK）。
 * @returns 参数装饰器工厂。
 */
export function createWsParamDecorator(
  paramtype: WsParamtype,
): (...pipes: (Type<PipeTransform> | PipeTransform)[]) => ParameterDecorator {
  return (...pipes: (Type<PipeTransform> | PipeTransform)[]) =>
    (target, key, index) => {
      const args =
        Reflect.getMetadata(PARAM_ARGS_METADATA, target.constructor, key!) ||
        {};
      Reflect.defineMetadata(
        PARAM_ARGS_METADATA,
        assignMetadata(args, paramtype, index, undefined, ...pipes),
        target.constructor,
        key!,
      );
    };
}

/**
 * 创建带数据/管道支持的 WebSocket 参数装饰器工厂
 * （@MessageBody 与 @Ack 均由它实现）。
 *
 * 处理步骤：
 * 1. 读取方法上已有的 PARAM_ARGS_METADATA 参数元数据；
 * 2. 判断第一个实参是属性名（字符串）还是管道：
 *    - 若为 nil 或字符串，视为数据（属性名），剩余实参都是管道；
 *    - 否则将其视为第一个管道（@MessageBody(new ValidationPipe()) 形式）；
 * 3. 用 assignMetadata 写回合并后的参数元数据。
 *
 * @param paramtype - 参数类型（PAYLOAD/ACK）。
 * @returns 形如 (data?, ...pipes) => ParameterDecorator 的装饰器工厂。
 */
export const createPipesWsParamDecorator =
  (paramtype: WsParamtype) =>
  (
    data?: any,
    ...pipes: (Type<PipeTransform> | PipeTransform)[]
  ): ParameterDecorator =>
  (target, key, index) => {
    const args =
      Reflect.getMetadata(PARAM_ARGS_METADATA, target.constructor, key!) || {};
    const hasParamData = isNil(data) || isString(data);
    const paramData = hasParamData ? data : undefined;
    const paramPipes = hasParamData ? pipes : [data, ...pipes];

    Reflect.defineMetadata(
      PARAM_ARGS_METADATA,
      assignMetadata(args, paramtype, index, paramData!, ...paramPipes),
      target.constructor,
      key!,
    );
  };
