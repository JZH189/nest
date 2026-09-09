import { PipeTransform, Type } from '@nestjs/common';
import { assignMetadata } from '@nestjs/common/decorators/http/route-params.decorator';
import { isNil, isString } from '@nestjs/common/utils/shared.utils';
import 'reflect-metadata';
import { PARAM_ARGS_METADATA } from '../constants';
import { RpcParamtype } from '../enums/rpc-paramtype.enum';

/**
 * 创建"无元数据"的 RPC 参数装饰器工厂。
 *
 * 是 @Payload()、@Ctx() 等装饰器的底层实现：把参数的类型（paramtype）、
 * 位置（index）以及管道（pipes）写入方法的反射元数据（PARAM_ARGS_METADATA），
 * 运行时由 RpcParamsFactory 读取这些元数据来决定注入什么值。
 *
 * @param paramtype - RPC 参数类型（RpcParamtype 枚举：PAYLOAD / CONTEXT / GRPC_CALL）
 * @returns 参数装饰器工厂，可接收若干管道（PipeTransform）
 */
export function createRpcParamDecorator(
  paramtype: RpcParamtype,
): (...pipes: (Type<PipeTransform> | PipeTransform)[]) => ParameterDecorator {
  return (...pipes: (Type<PipeTransform> | PipeTransform)[]) =>
    (target, key, index) => {
      // 1. 读取方法上已存在的参数元数据（没有则为空对象）
      const args =
        Reflect.getMetadata(PARAM_ARGS_METADATA, target.constructor, key!) ||
        {};
      // 2. 将当前参数的类型、位置与管道追加进元数据并写回
      Reflect.defineMetadata(
        PARAM_ARGS_METADATA,
        assignMetadata(args, paramtype, index, undefined, ...pipes),
        target.constructor,
        key!,
      );
    };
}

/**
 * 创建"带元数据"的 RPC 参数装饰器工厂。
 *
 * 与 createRpcParamDecorator 的区别在于支持传入装饰器数据 data
 * （如 @Payload('field') 中的字段名），并允许把 data 位置直接传管道。
 * 只有当 data 为字符串（或为空）时才视为"参数数据"，否则把 data
 * 当作第一个管道处理（这是 Nest HTTP 侧同名机制的通用约定）。
 *
 * @param paramtype - RPC 参数类型（RpcParamtype 枚举）
 * @returns 参数装饰器工厂，签名为 (data?, ...pipes)
 */
export const createPipesRpcParamDecorator =
  (paramtype: RpcParamtype) =>
  (
    data?: any,
    ...pipes: (Type<PipeTransform> | PipeTransform)[]
  ): ParameterDecorator =>
  (target, key, index) => {
    // 1. 读取方法上已存在的参数元数据
    const args =
      Reflect.getMetadata(PARAM_ARGS_METADATA, target.constructor, key!) || {};

    // 2. 判断 data 是"参数数据"（字符串/空）还是"第一个管道"（对象形式的 pipe）
    const hasParamData = isNil(data) || isString(data);
    const paramData = hasParamData ? data : undefined;
    const paramPipes = hasParamData ? pipes : [data, ...pipes];

    // 3. 将参数类型、位置、数据与管道写入反射元数据
    Reflect.defineMetadata(
      PARAM_ARGS_METADATA,
      assignMetadata(args, paramtype, index, paramData!, ...paramPipes),
      target.constructor,
      key!,
    );
  };
