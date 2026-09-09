import { Paramtype } from '@nestjs/common';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

/**
 * 参数 Token 工厂（Params Token Factory）：把内部参数位置枚举
 * （RouteParamtypes）转换为对外的参数类型字符串（Paramtype）。
 *
 * 在框架中的角色：管道执行时需要向 transform 方法传递
 * ArgumentMetadata.type（'body' | 'query' | 'param' | 'custom'），
 * 本类负责完成内部枚举到该字符串的映射。
 */
export class ParamsTokenFactory {
  /**
   * 将内部参数位置枚举转换为参数类型字符串。
   *
   * @param type - 内部的 RouteParamtypes 枚举值。
   * @returns 'body' | 'param' | 'query' | 'custom' 之一。
   */
  public exchangeEnumForString(type: RouteParamtypes): Paramtype {
    switch (type) {
      case RouteParamtypes.BODY:
        return 'body';
      case RouteParamtypes.PARAM:
        return 'param';
      case RouteParamtypes.QUERY:
        return 'query';
      default:
        return 'custom';
    }
  }
}
