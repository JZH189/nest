import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { IRouteParamsFactory } from './interfaces/route-params-factory.interface';

/**
 * 路由参数工厂：根据参数装饰器元数据从请求对象中提取参数值。
 *
 * 在框架中的角色：NestJS 的参数装饰器（@Param、@Body、@Query、@Headers、@Req、@Res
 * 等）会在编译期把 RouteParamtypes 枚举值和可选的装饰器数据写入控制器方法的元数据。
 * 运行时 RouterExecutionContext 会遍历这些元数据，调用本类的 exchangeKeyForValue
 * 把"元数据 key + 装饰器数据"交换为真实的参数值，再按顺序传给控制器方法。
 * 这是参数注入机制的核心实现。
 */
export class RouteParamsFactory implements IRouteParamsFactory {
  /**
   * 根据参数元数据 key 从请求/响应对象中提取对应值。
   *
   * @param key - RouteParamtypes 枚举值（或自定义装饰器的字符串 key），标识参数来源。
   * @param data - 装饰器传入的数据（如 @Query('id') 中的 'id'），用于定位具体字段；
   *               为空时通常返回整个对象。
   * @param req - HTTP 请求对象。
   * @param res - HTTP 响应对象。
   * @param next - Express 风格的 next 回调。
   * @returns 提取出的参数值；key 无法识别时返回 null。
   */
  public exchangeKeyForValue<
    TRequest extends Record<string, any> = any,
    TResponse = any,
    TResult = any,
  >(
    key: RouteParamtypes | string,
    data: string,
    { req, res, next }: { req: TRequest; res: TResponse; next: Function },
  ): TResult | null {
    switch (key) {
      // @Next() - 返回 next 回调（用于把控制权交给后续中间件）
      case RouteParamtypes.NEXT:
        return next as any;
      // @Req() - 返回原始请求对象
      case RouteParamtypes.REQUEST:
        return req as any;
      // @Res() - 返回原始响应对象
      case RouteParamtypes.RESPONSE:
        return res as any;
      // @Body('field') - 返回请求体中指定字段；无 data 时返回整个请求体
      case RouteParamtypes.BODY:
        return data && req.body ? req.body[data] : req.body;
      // @Body() 且开启 rawBody（如 useRawBody 配置）- 返回原始请求体字符串/Buffer
      case RouteParamtypes.RAW_BODY:
        return req.rawBody;
      // @Param('id') - 返回路径参数中指定项；无 data 时返回整个 params 对象
      case RouteParamtypes.PARAM:
        return data ? req.params[data] : req.params;
      // @HostParam('sub') - 返回路由主机匹配到的指定分组；无 data 时返回全部
      case RouteParamtypes.HOST:
        /* eslint-disable-next-line no-case-declarations */
        const hosts = req.hosts || {};
        return data ? hosts[data] : hosts;
      // @Query('q') - 返回查询字符串中指定项；无 data 时返回整个 query 对象
      case RouteParamtypes.QUERY:
        return data ? req.query[data] : req.query;
      // @Headers('content-type') - 返回指定请求头（key 统一小写匹配）；无 data 时返回全部请求头
      case RouteParamtypes.HEADERS:
        return data ? req.headers[data.toLowerCase()] : req.headers;
      // @Session() - 返回会话对象
      case RouteParamtypes.SESSION:
        return req.session;
      // @UploadedFile() - 返回单个上传文件（字段名为 data，默认 'file'）
      case RouteParamtypes.FILE:
        return req[data || 'file'];
      // @UploadedFiles() - 返回上传文件数组
      case RouteParamtypes.FILES:
        return req.files;
      // @Ip() - 返回客户端 IP 地址
      case RouteParamtypes.IP:
        return req.ip;
      // 未知 key（如自定义参数装饰器未注册解析逻辑）- 返回 null
      default:
        return null;
    }
  }
}
