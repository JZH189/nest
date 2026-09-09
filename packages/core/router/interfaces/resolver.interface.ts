/**
 * 路由解析器的通用接口。
 *
 * 在框架中的角色：RoutesResolver 实现了该接口，负责：
 * 1. resolve - 遍历容器中所有控制器实例，把它们的路由处理器注册到 HTTP 适配器上；
 * 2. registerNotFoundHandler - 注册 404（未找到路由）兜底处理器；
 * 3. registerExceptionHandler - 注册未捕获异常的兜底处理器。
 */
export interface Resolver {
  resolve(instance: any, basePath: string): void;
  registerNotFoundHandler(): void;
  registerExceptionHandler(): void;
}
