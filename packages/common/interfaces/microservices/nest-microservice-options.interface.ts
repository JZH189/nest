import { NestApplicationContextOptions } from '../nest-application-context-options.interface';

/**
 * 微服务应用的选项（`NestFactory.createMicroservice()` 的第二个参数），
 * 继承自应用上下文选项（日志器、错误中止策略等）。
 *
 * @publicApi
 */
export type NestMicroserviceOptions = NestApplicationContextOptions;
