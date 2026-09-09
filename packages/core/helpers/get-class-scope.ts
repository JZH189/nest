import { Scope } from '@nestjs/common';
import { SCOPE_OPTIONS_METADATA } from '@nestjs/common/constants';
import { Type } from '@nestjs/common/interfaces/type.interface';

/**
 * 读取类（提供者/控制器）上通过 @Injectable({ scope }) / @Controller({ scope })
 * 声明的作用域元数据。
 *
 * 在框架中的角色：实例化器（Injector/InstanceLoader）据此决定该类是
 * 单例（DEFAULT）、请求级（REQUEST）还是瞬态（TRANSIENT）作用域。
 * @param provider - 提供者类的构造函数
 * @returns 声明的作用域；未声明时返回 undefined（按默认单例处理）
 */
export function getClassScope(provider: Type<unknown>): Scope {
  const metadata = Reflect.getMetadata(SCOPE_OPTIONS_METADATA, provider);
  return metadata && metadata.scope;
}
