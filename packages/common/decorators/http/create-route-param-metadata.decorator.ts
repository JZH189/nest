import { uid } from 'uid';
import { ROUTE_ARGS_METADATA } from '../../constants';
import { PipeTransform } from '../../index';
import { Type } from '../../interfaces';
import { CustomParamFactory } from '../../interfaces/features/custom-route-param-factory.interface';
import { assignCustomParameterMetadata } from '../../utils/assign-custom-metadata.util';
import { isFunction, isNil } from '../../utils/shared.utils';

/**
 * 参数装饰器增强器的类型：可在自定义参数装饰器上叠加的额外参数装饰器
 * （例如 `@Req()` 这类内置参数装饰器），在写入元数据后依次执行。
 */
export type ParamDecoratorEnhancer = ParameterDecorator;

/**
 * 定义 HTTP 路由参数装饰器
 *
 * @param factory 工厂函数
 * @param enhancers 装饰器增强器
 *
 * @publicApi
 */
export function createParamDecorator<FactoryData = any, FactoryOutput = any>(
  factory: CustomParamFactory<FactoryData, FactoryOutput>,
  enhancers: ParamDecoratorEnhancer[] = [],
): (
  ...dataOrPipes: (Type<PipeTransform> | PipeTransform | FactoryData)[]
) => ParameterDecorator {
  // 1. 为该自定义装饰器生成一个全局唯一的参数类型标识（paramtype），
  //    用于与内置参数类型（Body/Query 等）区分并存入元数据
  const paramtype = uid(21);
  // 第一层调用：传入装饰器数据（如 'user'）与可选管道，返回真正的参数装饰器
  return (
      data?,
      ...pipes: (Type<PipeTransform> | PipeTransform | FactoryData)[]
    ): ParameterDecorator =>
    // 第二层：TypeScript 在参数上应用装饰器时调用，target 为类、key 为方法名、index 为参数下标
    (target, key, index) => {
      // 2. 读取该方法已收集的路由参数元数据（若为首次装饰则为空对象）
      const args =
        Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key!) ||
        {};

      // 3. 区分第一个参数是"装饰器数据"还是"管道"：
      //    若第一个参数本身是管道，则说明没有传入数据，需把它并入管道列表
      const isPipe = (pipe: any) =>
        pipe &&
        ((isFunction(pipe) &&
          pipe.prototype &&
          isFunction(pipe.prototype.transform)) ||
          isFunction(pipe.transform));

      const hasParamData = isNil(data) || !isPipe(data);
      const paramData = hasParamData ? (data as any) : undefined;
      const paramPipes = hasParamData ? pipes : [data, ...pipes];

      // 4. 将参数类型、下标、工厂函数、数据与管道合并写入 ROUTE_ARGS_METADATA，
      //    路由执行时由 ParamsTokenFactory 读取并调用 factory 解析出实际参数值
      Reflect.defineMetadata(
        ROUTE_ARGS_METADATA,
        assignCustomParameterMetadata(
          args,
          paramtype,
          index,
          factory,
          paramData,
          ...(paramPipes as PipeTransform[]),
        ),
        target.constructor,
        key!,
      );
      // 5. 依次执行叠加的参数装饰器增强器
      enhancers.forEach(fn => fn(target, key, index));
    };
}
