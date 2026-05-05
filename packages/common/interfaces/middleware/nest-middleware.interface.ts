/**
 * @see [中间件](https://docs.nestjs.cn/middleware)
 *
 * @publicApi
 */
export interface NestMiddleware<TRequest = any, TResponse = any> {
  use(req: TRequest, res: TResponse, next: (error?: any) => void): any;
}
