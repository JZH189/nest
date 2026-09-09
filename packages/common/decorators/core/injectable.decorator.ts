import { uid } from 'uid';
import { INJECTABLE_WATERMARK, SCOPE_OPTIONS_METADATA } from '../../constants';
import { ScopeOptions } from '../../interfaces/scope-options.interface';
import { Type } from '../../interfaces/type.interface';

/**
 * 定义注入作用域。
 *
 * @see [依赖注入作用域](https://docs.nestjs.cn/fundamentals/injection-scopes)
 *
 * @publicApi
 */
export type InjectableOptions = ScopeOptions;

/**
 * 将类标记为[提供者](https://docs.nestjs.cn/providers)的装饰器。
 * 提供者可以通过 Nest 内置的[依赖注入 (DI)](https://docs.nestjs.cn/providers#dependency-injection)
 * 系统，通过构造函数参数注入到其他类中。
 *
 * 注入提供者时，它必须在被注入类的模块范围内可见（广义上讲，即包含该类的模块）。
 * 可以通过以下方式实现：
 *
 * - 在同一模块范围内定义提供者
 * - 从一个模块范围导出提供者，并将其导入到被注入类的模块范围中
 * - 从使用 `@Global()` 装饰器标记为全局的模块中导出提供者
 *
 * 提供者也可以使用各种[自定义提供者](https://docs.nestjs.cn/fundamentals/custom-providers)技术
 * 以更明确和命令式的方式定义，从而暴露 DI 系统的更多功能。
 *
 * @param options 指定可注入对象作用域的选项
 *
 * @see [提供者](https://docs.nestjs.cn/providers)
 * @see [自定义提供者](https://docs.nestjs.cn/fundamentals/custom-providers)
 * @see [依赖注入作用域](https://docs.nestjs.cn/fundamentals/injection-scopes)
 *
 * @publicApi
 */
export function Injectable(options?: InjectableOptions): ClassDecorator {
  return (target: object) => {
    // INJECTABLE_WATERMARK：标记该类可被 DI 容器实例化，用于反射/诊断
    Reflect.defineMetadata(INJECTABLE_WATERMARK, true, target);
    // SCOPE_OPTIONS_METADATA：注入作用域（单例/请求/瞬态），实例化时读取
    Reflect.defineMetadata(SCOPE_OPTIONS_METADATA, options, target);
  };
}

/**
 * 将普通类快速标记为可注入提供者的辅助函数，常用于 mixin 模式
 * （动态创建继承自基类的类并使其可被依赖注入）。
 *
 * 为避免不同 mixin 实例类名冲突，会为其生成一个唯一的随机类名。
 *
 * @param mixinClass - 待标记为可注入的 mixin 类
 * @returns 已应用 `@Injectable()` 装饰的同一个类
 *
 * @publicApi
 */
export function mixin<T>(mixinClass: Type<T>) {
  Object.defineProperty(mixinClass, 'name', {
    value: uid(21),
  });
  Injectable()(mixinClass);
  return mixinClass;
}
