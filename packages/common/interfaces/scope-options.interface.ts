/**
 * @publicApi
 */
export enum Scope {
  /**
   * 提供者可以在多个类之间共享。提供者生命周期
   * 与应用程序生命周期严格绑定。应用程序引导后，
   * 所有提供者都已被实例化。
   */
  DEFAULT,
  /**
   * 每次使用时都会实例化一个新的私有提供者实例
   */
  TRANSIENT,
  /**
   * 为每个请求处理管道实例化一个新实例
   */
  REQUEST,
}

/**
 * @publicApi
 *
 * @see [依赖注入作用域](https://docs.nestjs.cn/fundamentals/injection-scopes)
 */
export interface ScopeOptions {
  /**
   * 指定注入的提供者或控制器的生命周期。
   */
  scope?: Scope;
  /**
   * 将提供者标记为持久的。此标志可与自定义上下文 ID 工厂策略结合使用，
   * 以构建惰性 DI 子树。
   *
   * 此标志只能与 scope = Scope.REQUEST 结合使用。
   */
  durable?: boolean;
}
