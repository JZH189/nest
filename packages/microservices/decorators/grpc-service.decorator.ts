import { Controller } from '@nestjs/common';

/**
 * 定义 gRPC 服务：装饰的类等同 @Controller，可注册 gRPC 消息处理器
 * （@GrpcMethod / @GrpcStreamMethod 等），并可通过构造函数注入同模块内的依赖。
 * 服务端扫描控制器时会把它当作普通的微服务控制器处理。
 */
export const GrpcService = Controller;
