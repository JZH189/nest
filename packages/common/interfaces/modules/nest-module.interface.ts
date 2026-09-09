import { MiddlewareConsumer } from '../middleware/middleware-consumer.interface';

/**
 * 模块类的契约：实现 `configure()` 方法以注册中间件。
 * 由 `@Module()` 装饰器标记的类实现，在应用初始化阶段由中间件模块调用。
 *
 * @publicApi
 */
export interface NestModule {
  /**
   * @param consumer 中间件配置消费者，通过 `consumer.apply(...).forRoutes(...)` 注册中间件
   */
  configure(consumer: MiddlewareConsumer);
}
