import {
  INestApplicationContext,
  InjectionToken,
  Logger,
} from '@nestjs/common';
import { ApplicationConfig } from '../application-config';
import { ModuleRef, NestContainer } from '../injector';
import { InternalCoreModule } from '../injector/internal-core-module/internal-core-module';
import { Module } from '../injector/module';
import {
  DebugReplFn,
  GetReplFn,
  HelpReplFn,
  MethodsReplFn,
  ResolveReplFn,
  SelectReplFn,
} from './native-functions';
import { ReplFunction } from './repl-function';
import type { ReplFunctionClass } from './repl.interfaces';

type ModuleKey = string;
/**
 * 单个模块的调试信息条目：记录该模块下所有控制器与提供者的
 * "字符串化名称 -> 注入 token" 映射，供 `debug` 命令打印使用。
 */
export type ModuleDebugEntry = {
  /** 该模块注册的所有控制器（名称 -> token） */
  controllers: Record<string, InjectionToken>;
  /** 该模块注册的所有提供者（名称 -> token） */
  providers: Record<string, InjectionToken>;
};

type ReplScope = Record<string, any>;

/**
 * REPL 上下文：调试 REPL 的核心"大脑"。
 *
 * 职责包括：
 * 1. 扫描容器中的所有模块，把模块类与其内部的 providers/controllers
 *    以字符串化 token 的形式注册到 `globalScope`（即 REPL 的全局作用域），
 *    使开发者可以在 REPL 中直接输入模块名/类名并利用自动补全；
 * 2. 维护 `debugRegistry` 调试注册表，供 `debug()` 命令打印模块结构；
 * 3. 实例化并注册所有原生 REPL 函数（get/resolve/select/debug/methods/help），
 *    同时支持传入自定义的 ReplFunction 子类进行扩展。
 */
export class ReplContext {
  public readonly logger = new Logger(ReplContext.name);
  /** 模块调试注册表：模块名 -> { controllers, providers } 的映射 */
  public debugRegistry: Record<ModuleKey, ModuleDebugEntry> = {};
  /** 暴露给 REPL 的全局作用域，键为模块/类/函数的字符串名称 */
  public readonly globalScope: ReplScope = Object.create(null);
  /** 已注册的原生函数集合：函数名（含别名） -> 函数实例 */
  public readonly nativeFunctions = new Map<
    string,
    InstanceType<ReplFunctionClass>
  >();
  private readonly container: NestContainer;

  /**
   * @param app - 已初始化的应用上下文，从中提取底层 IoC 容器。
   * @param nativeFunctionsClassRefs - 额外的自定义原生函数类（ReplFunction 子类），可选。
   */
  constructor(
    public readonly app: INestApplicationContext,
    nativeFunctionsClassRefs?: ReplFunctionClass[],
  ) {
    this.container = (app as any).container; // Using `any` because `app.container` is not public.

    this.initializeContext();
    this.initializeNativeFunctions(nativeFunctionsClassRefs || []);
  }

  /** 直接向标准输出写入文本（绕过日志系统，用于 REPL 打印结果）。 */
  public writeToStdout(text: string) {
    process.stdout.write(text);
  }

  /**
   * 初始化全局作用域：遍历容器中的每个模块，
   * 将模块类及其 providers/controllers 注册进 globalScope 与 debugRegistry。
   */
  private initializeContext() {
    const modules = this.container.getModules();

    modules.forEach(moduleRef => {
      // 1. 以模块类名为键；内部核心模块（InternalCoreModule）不暴露给用户
      let moduleName = moduleRef.metatype.name;
      if (moduleName === InternalCoreModule.name) {
        return;
      }
      // 2. 若同名模块已存在（如动态模块多次注册），追加模块 token 加以区分
      if (this.globalScope[moduleName]) {
        moduleName += ` (${moduleRef.token})`;
      }

      // 3. 分别注册该模块的 providers 与 controllers 到全局作用域和调试注册表
      this.introspectCollection(moduleRef, moduleName, 'providers');
      this.introspectCollection(moduleRef, moduleName, 'controllers');

      // For in REPL auto-complete functionality
      // 4. 把模块类本身也挂到全局作用域，便于在 REPL 中通过模块名自动补全并 select
      Object.defineProperty(this.globalScope, moduleName, {
        value: moduleRef.metatype,
        configurable: false,
        enumerable: true,
      });
    });
  }

  /**
   * 检查（introspect）模块的某个实例集合（providers 或 controllers）：
   * 把每个实例的字符串化 token 注册到全局作用域（用于自动补全），
   * 并写入 debugRegistry（供 debug 命令展示）。
   *
   * @param moduleRef - 目标模块的引用。
   * @param moduleKey - 在注册表中使用的模块键名。
   * @param collection - 要检查的集合名：'providers' 或 'controllers'。
   */
  private introspectCollection(
    moduleRef: Module,
    moduleKey: ModuleKey,
    collection: keyof ModuleDebugEntry,
  ) {
    const moduleDebugEntry = {};
    moduleRef[collection].forEach(({ token }) => {
      // 1. 把 token 转成可读字符串（类取类名，字符串加引号，其他 toString）
      const stringifiedToken = this.stringifyToken(token);
      if (
        stringifiedToken === ApplicationConfig.name ||
        stringifiedToken === moduleRef.metatype.name
      ) {
        // 2. 跳过框架内部的 ApplicationConfig 以及与模块同名的条目
        return;
      }

      if (!this.globalScope[stringifiedToken]) {
        // For in REPL auto-complete functionality
        // 3. 将实例 token 注册进全局作用域，使 REPL 中可自动补全并直接 get
        Object.defineProperty(this.globalScope, stringifiedToken, {
          value: token,
          configurable: false,
          enumerable: true,
        });
      }

      if (stringifiedToken === ModuleRef.name) {
        // 4. ModuleRef 虽注册到全局作用域，但不进入 debug 注册表
        return;
      }

      moduleDebugEntry[stringifiedToken] = token;
    });

    // 5. 合并写入该模块的调试条目（同一模块可能被 introspect 多个集合）
    this.debugRegistry[moduleKey] = {
      ...this.debugRegistry?.[moduleKey],
      [collection]: moduleDebugEntry,
    };
  }

  /**
   * 将注入 token 转为字符串形式：
   * 类（function）取类名；字符串 token 加引号包裹；其余调用 toString()。
   *
   * @param token - 待字符串化的注入 token。
   * @returns 用于 REPL 展示与自动补全的字符串。
   */
  private stringifyToken(token: unknown): string {
    return typeof token !== 'string'
      ? typeof token === 'function'
        ? token.name
        : (token?.toString() as string)
      : `"${token}"`;
  }

  /**
   * 实例化一个原生函数类并注册到 nativeFunctions 表中，
   * 同时为其声明的每个别名创建"影子"实例（共享同一 action，仅函数名不同）。
   *
   * @param NativeFunctionRef - 原生函数类（ReplFunction 的子类构造器）。
   * @returns 包含本体及其所有别名的函数实例数组。
   */
  private addNativeFunction(
    NativeFunctionRef: ReplFunctionClass,
  ): InstanceType<ReplFunctionClass>[] {
    const nativeFunction = new NativeFunctionRef(this);
    const nativeFunctions = [nativeFunction];

    this.nativeFunctions.set(nativeFunction.fnDefinition.name, nativeFunction);

    // 1. 为每个别名创建一个以本体为原型的对象，仅覆盖 fnDefinition.name
    nativeFunction.fnDefinition.aliases?.forEach(aliasName => {
      const aliasNativeFunction: InstanceType<ReplFunctionClass> =
        Object.create(nativeFunction);
      aliasNativeFunction.fnDefinition = {
        name: aliasName,
        description: aliasNativeFunction.fnDefinition.description,
        signature: aliasNativeFunction.fnDefinition.signature,
      };
      // 2. 别名同样进入 nativeFunctions 表，help 命令会一并列出
      this.nativeFunctions.set(aliasName, aliasNativeFunction);
      nativeFunctions.push(aliasNativeFunction);
    });

    return nativeFunctions;
  }

  /**
   * 把原生函数的 action 绑定后挂到 REPL 全局作用域，
   * 并在该函数引用上定义一个 `help` getter——在 REPL 中输入 `<fn>.help`
   * 即可动态打印该函数的帮助信息。
   *
   * @param nativeFunction - 待注册的原生函数实例。
   */
  private registerFunctionIntoGlobalScope(
    nativeFunction: InstanceType<ReplFunctionClass>,
  ) {
    // Bind the method to REPL's context:
    this.globalScope[nativeFunction.fnDefinition.name] =
      nativeFunction.action.bind(nativeFunction);

    // Load the help trigger as a `help` getter on each native function:
    const functionBoundRef: ReplFunction['action'] =
      this.globalScope[nativeFunction.fnDefinition.name];
    Object.defineProperty(functionBoundRef, 'help', {
      enumerable: false,
      configurable: false,
      get: () =>
        // Dynamically builds the help message as will unlikely to be called
        // several times.
        this.writeToStdout(nativeFunction.makeHelpMessage()),
    });
  }

  /**
   * 初始化所有原生函数：内置的 6 个函数（help/get/resolve/select/debug/methods）
   * 加上用户自定义传入的函数类，逐个实例化并注册进 REPL 全局作用域。
   *
   * @param nativeFunctionsClassRefs - 用户扩展的自定义原生函数类列表。
   */
  private initializeNativeFunctions(
    nativeFunctionsClassRefs: ReplFunctionClass[],
  ): void {
    const builtInFunctionsClassRefs: ReplFunctionClass[] = [
      HelpReplFn,
      GetReplFn,
      ResolveReplFn,
      SelectReplFn,
      DebugReplFn,
      MethodsReplFn,
    ];

    builtInFunctionsClassRefs
      .concat(nativeFunctionsClassRefs)
      .forEach(NativeFunction => {
        const nativeFunctions = this.addNativeFunction(NativeFunction);
        nativeFunctions.forEach(nativeFunction => {
          this.registerFunctionIntoGlobalScope(nativeFunction);
        });
      });
  }
}
