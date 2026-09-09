import { HttpServer } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';

/**
 * RequestMethod 枚举到底层 HTTP 服务器方法名的映射表。
 * 键为框架的 RequestMethod 枚举值，值为适配器（HttpServer）上的方法名。
 */
export const REQUEST_METHOD_MAP = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.ALL]: 'all',
  [RequestMethod.OPTIONS]: 'options',
  [RequestMethod.HEAD]: 'head',
  [RequestMethod.SEARCH]: 'search',
  [RequestMethod.PROPFIND]: 'propfind',
  [RequestMethod.PROPPATCH]: 'proppatch',
  [RequestMethod.MKCOL]: 'mkcol',
  [RequestMethod.COPY]: 'copy',
  [RequestMethod.MOVE]: 'move',
  [RequestMethod.LOCK]: 'lock',
  [RequestMethod.UNLOCK]: 'unlock',
} as const satisfies Record<RequestMethod, keyof HttpServer>;

/**
 * 路由方法工厂：把框架的 RequestMethod 枚举映射到底层 HTTP 适配器上的
 * 对应注册方法（如 get/post/put）。
 *
 * 在框架中的角色：路由工厂（RoutesResolver/RouterProxy）在注册路由时，
 * 通过本工厂从适配器上取出正确的“注册方法”来绑定路径与处理器。
 */
export class RouterMethodFactory {
  /**
   * 从 HTTP 服务器（适配器）上取出与请求方法对应的注册函数。
   * @param target - 底层 HTTP 服务器/适配器实例
   * @param requestMethod - 框架的 RequestMethod 枚举值
   * @returns 适配器上的方法注册函数；不支持的枚举值时回退到 use
   */
  public get(target: HttpServer, requestMethod: RequestMethod): Function {
    const methodName = REQUEST_METHOD_MAP[requestMethod];
    const method = target[methodName];
    if (!method) {
      return target.use;
    }
    return method;
  }
}
