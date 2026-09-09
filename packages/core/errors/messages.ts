import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';
import { isNil, isSymbol } from '@nestjs/common/utils/shared.utils';
import {
  InjectorDependency,
  InjectorDependencyContext,
} from '../injector/injector';
import { Module } from '../injector/module';

/**
 * 错误信息工厂模块：集中定义 Nest 核心各类异常的用户可读文案。
 * 每个导出常量都是一个（模板）函数，根据出错上下文
 * （模块名、依赖名、作用域链等）拼装出带排查建议的完整错误消息。
 */

/**
 * Returns the name of an instance or `undefined`
 * @param instance The instance which should get the name from
 */
const getInstanceName = (instance: unknown): string => {
  if ((instance as ForwardReference)?.forwardRef) {
    return (instance as ForwardReference).forwardRef()?.name;
  }

  if ((instance as DynamicModule)?.module) {
    return (instance as DynamicModule).module?.name;
  }

  return (instance as Type)?.name;
};

/**
 * Returns the name of the dependency.
 * Tries to get the class name, otherwise the string value
 * (= injection token). As fallback to any falsy value for `dependency`, it
 * returns `fallbackValue`
 * @param dependency The name of the dependency to be displayed
 * @param fallbackValue The fallback value if the dependency is falsy
 * @param disambiguated Whether dependency's name is disambiguated with double quotes
 */
const getDependencyName = (
  dependency: InjectorDependency | undefined,
  fallbackValue: string,
  disambiguated = true,
): string =>
  // use class name
  getInstanceName(dependency) ||
  // use injection token (symbol)
  (isSymbol(dependency) && dependency.toString()) ||
  // use string directly
  (dependency
    ? disambiguated
      ? `"${dependency as string}"`
      : (dependency as string)
    : undefined) ||
  // otherwise
  fallbackValue;

/**
 * Returns the name of the module
 * Tries to get the class name. As fallback it returns 'current'.
 * @param module The module which should get displayed
 */
const getModuleName = (module: Module | undefined) =>
  (module && getInstanceName(module.metatype)) || 'current';

const stringifyScope = (scope: any[]): string =>
  (scope || []).map(getInstanceName).join(' -> ');

/**
 * 构建"无法解析依赖"错误的完整文案：
 * 指出出错的参数位置（index）/属性（key），并附上针对性的排查建议
 * （如 import type 误用、模块未导入提供者等）。
 *
 * @param type - 无法完成依赖解析的类名
 * @param unknownDependencyContext - 依赖解析上下文（索引、名称、依赖列表等）
 * @param moduleRef - 发生错误的模块引用（可能为 undefined）
 * @returns 拼装好的错误消息
 */
export const UNKNOWN_DEPENDENCIES_MESSAGE = (
  type: string | symbol,
  unknownDependencyContext: InjectorDependencyContext,
  moduleRef: Module | undefined,
) => {
  const { index, name, dependencies, key } = unknownDependencyContext;
  const moduleName = getModuleName(moduleRef);
  const dependencyName = getDependencyName(name, 'dependency');

  const isImportTypeIssue =
    !isNil(index) &&
    dependencies &&
    (dependencies[index] === undefined ||
      dependencies[index] === Object ||
      (typeof dependencies[index] === 'function' &&
        (dependencies[index] as any).name === 'Object'));

  let potentialSolutions: string;

  if (isImportTypeIssue) {
    potentialSolutions = `\n
Potential solutions:
- The dependency at index [${index}] appears to be undefined at runtime
- This commonly occurs when using 'import type' instead of 'import' for injectable classes
- Check your imports and change:
  ❌ import type { SomeService } from './some.service';
  ✅ import { SomeService } from './some.service';
- Ensure the imported class is decorated with @Injectable() or is a valid provider
- If using dynamic imports, ensure the class is available at runtime, not just for type checking

For more common dependency resolution issues, see: https://docs.nestjs.cn/faq/common-errors`;
  } else {
    potentialSolutions =
      // If module's name is well defined
      moduleName !== 'current'
        ? `\n
Potential solutions:
- Is ${moduleName} a valid NestJS module?
- If ${dependencyName} is a provider, is it part of the current ${moduleName}?
- If ${dependencyName} is exported from a separate @Module, is that module imported within ${moduleName}?
  @Module({
    imports: [ /* the Module containing ${dependencyName} */ ]
  })

For more common dependency resolution issues, see: https://docs.nestjs.cn/faq/common-errors`
        : `\n
Potential solutions:
- If ${dependencyName} is a provider, is it part of the current Module?
- If ${dependencyName} is exported from a separate @Module, is that module imported within Module?
  @Module({
    imports: [ /* the Module containing ${dependencyName} */ ]
  })

For more common dependency resolution issues, see: https://docs.nestjs.cn/faq/common-errors`;
  }

  let message = `Nest can't resolve dependencies of the ${type.toString()}`;

  if (isNil(index)) {
    message += `. Please make sure that the "${key!.toString()}" property is available in the current context.${potentialSolutions}`;
    return message;
  }
  const dependenciesName = (dependencies || []).map(dependencyName =>
    getDependencyName(dependencyName, '+', false),
  );
  dependenciesName[index] = '?';

  const tokenFragment =
    !isImportTypeIssue && name !== undefined ? ` ${dependencyName}` : '';
  const contextLabel = isImportTypeIssue ? 'current' : moduleName;

  message += ` (`;
  message += dependenciesName.join(', ');
  message += `). Please make sure that the argument${tokenFragment} at index [${index}]`;
  message += ` is available in the ${contextLabel} module.`;
  message += potentialSolutions;

  return message;
};

/**
 * 构建"中间件缺少 use 方法"的错误文案。
 *
 * @param text - 模板字符串字面量（标签模板占位）
 * @param name - 出错的中间件名称
 * @returns 错误消息
 */
export const INVALID_MIDDLEWARE_MESSAGE = (
  text: TemplateStringsArray,
  name: string,
) => `The middleware doesn't provide the 'use' method (${name})`;

/**
 * 构建"forwardRef 为 undefined"的错误文案（模块循环依赖场景），
 * 附带作用域链和文档链接。
 *
 * @param scope - 作用域链（模块类数组）
 * @returns 错误消息
 */
export const UNDEFINED_FORWARDREF_MESSAGE = (
  scope: Type<any>[],
) => `Nest cannot create the module instance. Often, this is because of a circular dependency between modules. Use forwardRef() to avoid it.

(Read more: https://docs.nestjs.cn/fundamentals/circular-dependency)
Scope [${stringifyScope(scope)}]
`;

/**
 * 构建"imports 数组中出现无效值"的错误文案。
 *
 * @param parentModule - 出错的父模块
 * @param index - 无效值在 imports 数组中的索引
 * @param scope - 作用域链
 * @returns 错误消息
 */
export const INVALID_MODULE_MESSAGE = (
  parentModule: any,
  index: number,
  scope: any[],
) => {
  const parentModuleName = parentModule?.name || 'module';

  return `Nest cannot create the ${parentModuleName} instance.
Received an unexpected value at index [${index}] of the ${parentModuleName} "imports" array.

Scope [${stringifyScope(scope)}]`;
};

/**
 * 构建"把 @Injectable/@Controller/@Catch 类当作模块导入"的错误文案。
 *
 * @param metatypeUsedAsAModule - 被误用作模块的类
 * @param scope - 作用域链
 * @returns 错误消息
 */
export const USING_INVALID_CLASS_AS_A_MODULE_MESSAGE = (
  metatypeUsedAsAModule: Type | ForwardReference,
  scope: any[],
) => {
  const metatypeNameQuote = `"${getInstanceName(metatypeUsedAsAModule)}"`;

  return `Classes annotated with @Injectable(), @Catch(), and @Controller() decorators must not appear in the "imports" array of a module.
Please remove ${metatypeNameQuote} (including forwarded occurrences, if any) from all of the "imports" arrays.

Scope [${stringifyScope(scope)}]
`;
};

/**
 * 构建"imports 数组中某个模块为 undefined"的错误文案，
 * 列出可能原因（循环依赖、导入语句错误等）。
 *
 * @param parentModule - 出错的父模块
 * @param index - undefined 模块在 imports 数组中的索引
 * @param scope - 作用域链
 * @returns 错误消息
 */
export const UNDEFINED_MODULE_MESSAGE = (
  parentModule: any,
  index: number,
  scope: any[],
) => {
  const parentModuleName = parentModule?.name || 'module';

  return `Nest cannot create the ${parentModuleName} instance.
The module at index [${index}] of the ${parentModuleName} "imports" array is undefined.

Potential causes:
- A circular dependency between modules. Use forwardRef() to avoid it. Read more: https://docs.nestjs.cn/fundamentals/circular-dependency
- The module at index [${index}] is of type "undefined". Check your import statements and the type of the module.

Scope [${stringifyScope(scope)}]`;
};

/**
 * 构建"导出了不属于本模块的 provider/模块"的错误文案。
 *
 * @param token - 被导出的 provider/模块 token（默认 'item'）
 * @param module - 当前处理的模块名
 * @returns 错误消息
 */
export const UNKNOWN_EXPORT_MESSAGE = (
  token: string | symbol = 'item',
  module: string,
) => {
  token = isSymbol(token) ? token.toString() : token;

  return `Nest cannot export a provider/module that is not a part of the currently processed module (${module}). Please verify whether the exported ${token} is available in this particular context.

Possible Solutions:
- Is ${token} part of the relevant providers/imports within ${module}?

For more common dependency resolution issues, see: https://docs.nestjs.cn/faq/common-errors
`;
};

/**
 * 构建"ModuleRef 无法实例化该类"的错误文案。
 *
 * @param text - 模板字符串字面量（标签模板占位）
 * @param value - 不可构造的值
 * @returns 错误消息
 */
export const INVALID_CLASS_MESSAGE = (text: TemplateStringsArray, value: any) =>
  `ModuleRef cannot instantiate class (${value} is not constructable).`;

/**
 * 构建"请求/瞬态作用域提供者不能与 get() 一起使用"的错误文案
 * （应改用 resolve()）。
 *
 * @param text - 模板字符串字面量（标签模板占位）
 * @param name - 提供者类名或 token
 * @returns 错误消息
 */
export const INVALID_CLASS_SCOPE_MESSAGE = (
  text: TemplateStringsArray,
  name: string | undefined,
) =>
  `${
    name || 'This class'
  } is marked as a scoped provider. Request and transient-scoped providers can't be used in combination with "get()" method. Please, use "resolve()" instead.`;

/**
 * 构建"控制器缺少 @Controller() 装饰器"的错误文案。
 *
 * @param metatype - 出错的控制器类
 * @returns 错误消息
 */
export const UNKNOWN_REQUEST_MAPPING = (metatype: Type) => {
  const className = metatype.name;
  return className
    ? `An invalid controller has been detected. "${className}" does not have the @Controller() decorator but it is being listed in the "controllers" array of some module.`
    : `An invalid controller has been detected. Perhaps, one of your controllers is missing the @Controller() decorator.`;
};

/** 中间件配置无效的固定错误文案（configure() 方法传参错误时使用）。 */
export const INVALID_MIDDLEWARE_CONFIGURATION = `An invalid middleware configuration has been passed inside the module 'configure()' method.`;
/** 未捕获运行时异常的通用错误文案。 */
export const UNHANDLED_RUNTIME_EXCEPTION = `Unhandled Runtime Exception.`;
/** 异常过滤器无效的固定错误文案。 */
export const INVALID_EXCEPTION_FILTER = `Invalid exception filters (@UseFilters()).`;
/** 未安装 @nestjs/microservices 包时的错误文案。 */
export const MICROSERVICES_PACKAGE_NOT_FOUND_EXCEPTION = `Unable to load @nestjs/microservices package. (Please make sure that it's already installed.)`;
