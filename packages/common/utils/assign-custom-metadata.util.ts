import { CUSTOM_ROUTE_ARGS_METADATA } from '../constants';
import {
  ParamData,
  RouteParamMetadata,
} from '../decorators/http/route-params.decorator';
import { PipeTransform, Type } from '../interfaces';
import { CustomParamFactory } from '../interfaces/features/custom-route-param-factory.interface';

/**
 * 为"自定义路由参数装饰器"（createParamDecorator 创建的装饰器）注册元数据。
 *
 * 装饰器工厂（如 @Query()、@Body() 等的自定义版本）在应用时会调用此函数，
 * 将自定义参数工厂、附加数据（data）和管道等信息，以特定的元数据键
 * （"paramtype{CUSTOM_ROUTE_ARGS_METADATA}:{index}"）写进参数元数据表，
 * 供路由执行时在运行期解析方法参数。
 *
 * @param args 该方法上已收集的参数元数据表（键为参数描述字符串）
 * @param paramtype 参数类型键（自定义装饰器固定使用 CUSTOM_ROUTE_ARGS_METADATA 前缀）
 * @param index 参数在方法签名中的位置索引
 * @param factory 自定义参数工厂函数，运行期根据请求上下文生成参数值
 * @param data 传给装饰器的附加数据（如 @Query('id') 中的 'id'）
 * @param pipes 绑定到该参数的管道列表
 * @returns 追加了新元数据条目的完整参数元数据表
 */
export function assignCustomParameterMetadata(
  args: Record<number, RouteParamMetadata>,
  paramtype: number | string,
  index: number,
  factory: CustomParamFactory,
  data?: ParamData,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
) {
  return {
    ...args,
    [`${paramtype}${CUSTOM_ROUTE_ARGS_METADATA}:${index}`]: {
      index,
      factory,
      data,
      pipes,
    },
  };
}
