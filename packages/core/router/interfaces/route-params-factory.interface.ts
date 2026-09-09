import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

/**
 * 路由参数工厂的接口定义。
 *
 * 在框架中的角色：RouteParamsFactory 实现该接口，根据参数装饰器（@Param、@Body、
 * @Query 等）写入的元数据 key，从请求对象中交换（提取）出对应的参数值。
 */
export interface IRouteParamsFactory {
  exchangeKeyForValue<
    TRequest extends Record<string, any> = any,
    TResponse = any,
    TResult = any,
  >(
    key: RouteParamtypes | string,
    data: any,
    { req, res, next }: { req: TRequest; res: TResponse; next: Function },
  ): TResult | null;
}
