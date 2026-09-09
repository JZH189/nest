import { SCOPE_OPTIONS_METADATA } from '@nestjs/common/constants';
import { Type } from '@nestjs/common/interfaces/type.interface';

/**
 * 读取提供者上通过 @Injectable({ durable }) 声明的“持久（durable）”标记。
 *
 * 在框架中的角色：durable 提供者属于请求级作用域的优化特性——其依赖树
 * 在多个请求上下文间共享（复用父级上下文），injector 据此决定是否把该
 * 提供者标记为 durable 依赖树的一部分。
 * @param provider - 提供者类的构造函数
 * @returns durable 标记值；未声明时返回 undefined
 */
export function isDurable(provider: Type<unknown>): boolean | undefined {
  const metadata = Reflect.getMetadata(SCOPE_OPTIONS_METADATA, provider);
  return metadata && metadata.durable;
}
