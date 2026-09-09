/* eslint-disable @typescript-eslint/no-empty-object-type */
import { DynamicModule, Provider } from '../interfaces';
import { Logger } from '../services/logger.service';
import { randomStringGenerator } from '../utils/random-string-generator.util';
import {
  ASYNC_METHOD_SUFFIX,
  ASYNC_OPTIONS_METADATA_KEYS,
  CONFIGURABLE_MODULE_ID,
  DEFAULT_FACTORY_CLASS_METHOD_KEY,
  DEFAULT_METHOD_KEY,
} from './constants';
import {
  ConfigurableModuleAsyncOptions,
  ConfigurableModuleCls,
  ConfigurableModuleHost,
  ConfigurableModuleOptionsFactory,
} from './interfaces';
import { generateOptionsInjectionToken, getInjectionProviders } from './utils';

/**
 * @publicApi
 */
export interface ConfigurableModuleBuilderOptions {
  /**
   * 指定模块选项提供者应使用哪个注入令牌。
   * 默认情况下，将使用自动生成的 UUID。
   */
  optionsInjectionToken?: string | symbol;
  /**
   * 默认情况下，UUID 将用作模块选项提供者令牌。
   * 显式指定 "moduleName" 将指示 "ConfigurableModuleBuilder"
   * 使用更具描述性的提供者令牌。
   *
   * 例如，`moduleName: "Cache"` 将自动生成提供者令牌："CACHE_MODULE_OPTIONS"。
   */
  moduleName?: string;
  /**
   * 指示模块是否应始终为 "transient" —— 意思是，
   * 每次调用静态方法构造动态模块时，
   * 无论传入什么参数，都会创建一个新的"唯一"模块。
   *
   * @default false
   */
  alwaysTransient?: boolean;
}

/**
 * 让你创建可配置模块的工厂，
 * 并提供了一种减少大多数动态模块样板代码的方法。
 *
 * @publicApi
 */
export class ConfigurableModuleBuilder<
  ModuleOptions,
  StaticMethodKey extends string = typeof DEFAULT_METHOD_KEY,
  FactoryClassMethodKey extends string =
    typeof DEFAULT_FACTORY_CLASS_METHOD_KEY,
  ExtraModuleDefinitionOptions = {},
> {
  /**
   * 动态模块同步静态方法（如 "register" / "forRoot"）的名称，
   * 可通过 "setClassMethodName" 自定义，默认为 "register"。
   */
  protected staticMethodKey: StaticMethodKey;
  /**
   * 异步配置工厂类必须实现的方法名（如 "createConfig"），
   * 可通过 "setFactoryMethodName" 自定义，默认为 "create"。
   */
  protected factoryClassMethodKey: FactoryClassMethodKey;
  /**
   * "extras" 额外选项对象：由 "setExtras" 注册的默认值，
   * 会与模块使用者传入的选项合并后传给变换函数，并用于从用户选项中剥离出"额外选项"。
   */
  protected extras: ExtraModuleDefinitionOptions;
  /**
   * 模块定义变换函数：在生成最终 "DynamicModule" 之前对其进行加工，
   * 通常用于把 extras（例如 isGlobal）映射到动态模块的属性（例如 global）上。
   */
  protected transformModuleDefinition: (
    definition: DynamicModule,
    extraOptions: ExtraModuleDefinitionOptions,
  ) => DynamicModule;

  protected readonly logger = new Logger(ConfigurableModuleBuilder.name);

  /**
   * 创建一个新的 "ConfigurableModuleBuilder" 实例。
   *
   * 注意：各个 "setXxx" 方法并不是原地修改，而是基于当前实例
   * （作为 parentBuilder）派生出新实例，从而实现不可变的链式调用。
   *
   * @param options 构建器配置项（注入令牌、模块名、是否始终 transient 等）
   * @param parentBuilder 父构建器实例；传入时会继承其全部状态（方法名、extras、变换函数等）
   */
  constructor(
    protected readonly options: ConfigurableModuleBuilderOptions = {},
    parentBuilder?: ConfigurableModuleBuilder<ModuleOptions>,
  ) {
    if (parentBuilder) {
      // 从父构建器复制所有已设置的状态，使派生出的新构建器继承既有配置
      this.staticMethodKey = parentBuilder.staticMethodKey as StaticMethodKey;
      this.factoryClassMethodKey =
        parentBuilder.factoryClassMethodKey as FactoryClassMethodKey;
      this.transformModuleDefinition =
        parentBuilder.transformModuleDefinition as (
          definition: DynamicModule,
          extraOptions: ExtraModuleDefinitionOptions,
        ) => DynamicModule;
      this.extras = parentBuilder.extras as ExtraModuleDefinitionOptions;
    }
  }

  /**
   * 注册 "extras" 对象（一组可用于修改动态模块定义的额外选项）。
   * 你在 "extras" 对象中指定的值将用作默认值（可以被模块使用者覆盖）。
   *
   * 此方法还应用了所谓的 "module definition transform function"，
   * 它将自动生成的动态模块对象（"DynamicModule"）和实际的消费者 "extras" 对象作为输入参数。
   * "extras" 对象由模块使用者明确指定的值和默认值组成。
   *
   * @example
   * ```typescript
   * .setExtras<{ isGlobal?: boolean }>({ isGlobal: false }, (definition, extras) =>
   *    ({ ...definition, global: extras.isGlobal })
   * )
   * ```
   */
  setExtras<ExtraModuleDefinitionOptions>(
    extras: ExtraModuleDefinitionOptions,
    transformDefinition: (
      definition: DynamicModule,
      extras: ExtraModuleDefinitionOptions,
    ) => DynamicModule = def => def,
  ) {
    // 基于当前实例派生新构建器（不可变风格），避免污染原实例
    const builder = new ConfigurableModuleBuilder<
      ModuleOptions,
      StaticMethodKey,
      FactoryClassMethodKey,
      ExtraModuleDefinitionOptions
    >(this.options, this as any);
    builder.extras = extras;
    builder.transformModuleDefinition = transformDefinition;
    return builder;
  }

  /**
   * 动态模块必须公开公共静态方法，让你传入
   * 配置参数（从外部控制模块的行为）。
   * 你可能在其他模块中看到的常用名称有：
   * "forRoot"、"forFeature"、"register"、"configure"。
   *
   * 此方法 "setClassMethodName" 让你指定
   * 将被自动生成的方法的名称。
   *
   * @param key 方法的名称
   */
  setClassMethodName<StaticMethodKey extends string>(key: StaticMethodKey) {
    // 派生新构建器并仅更新静态方法名（不可变链式调用）
    const builder = new ConfigurableModuleBuilder<
      ModuleOptions,
      StaticMethodKey,
      FactoryClassMethodKey,
      ExtraModuleDefinitionOptions
    >(this.options, this as any);
    builder.staticMethodKey = key;
    return builder;
  }

  /**
   * 异步配置的模块（依赖其他模块，即 "ConfigModule"）
   * 让你传入将被注册并实例化为提供者的配置工厂类。
   * 然后，此提供者将用于获取模块的配置。为了提供配置，
   * 必须实现相应的工厂方法。
   *
   * 此方法（"setFactoryMethodName"）让你控制配置工厂需要实现的方法名称（默认为 "create"）。
   *
   * @param key 方法的名称
   */
  setFactoryMethodName<FactoryClassMethodKey extends string>(
    key: FactoryClassMethodKey,
  ) {
    // 派生新构建器并仅更新工厂方法名（不可变链式调用）
    const builder = new ConfigurableModuleBuilder<
      ModuleOptions,
      StaticMethodKey,
      FactoryClassMethodKey,
      ExtraModuleDefinitionOptions
    >(this.options, this as any);
    builder.factoryClassMethodKey = key;
    return builder;
  }

  /**
   * 返回由多个属性组成的对象，让你
   * 轻松构造动态可配置模块。详见 "ConfigurableModuleHost" 接口。
   */
  build(): ConfigurableModuleHost<
    ModuleOptions,
    StaticMethodKey,
    FactoryClassMethodKey,
    ExtraModuleDefinitionOptions
  > {
    // 1. 为未显式指定的各项配置填充默认值：默认静态方法名 "register"
    this.staticMethodKey ??= DEFAULT_METHOD_KEY as StaticMethodKey;
    // 2. 默认工厂方法名 "create"
    this.factoryClassMethodKey ??=
      DEFAULT_FACTORY_CLASS_METHOD_KEY as FactoryClassMethodKey;
    // 3. 默认的选项注入令牌：优先使用 "moduleName" 派生的可读令牌（如 "CACHE_MODULE_OPTIONS"），否则生成随机 UUID 令牌
    this.options.optionsInjectionToken ??= this.options.moduleName
      ? this.constructInjectionTokenString()
      : generateOptionsInjectionToken();
    // 4. 默认的变换函数为恒等函数（原样返回模块定义）
    this.transformModuleDefinition ??= definition => definition;

    return {
      ConfigurableModuleClass:
        this.createConfigurableModuleCls<ModuleOptions>(),
      MODULE_OPTIONS_TOKEN: this.options.optionsInjectionToken,
      ASYNC_OPTIONS_TYPE: this.createTypeProxy('ASYNC_OPTIONS_TYPE'),
      OPTIONS_TYPE: this.createTypeProxy('OPTIONS_TYPE'),
    };
  }

  /**
   * 根据 "moduleName" 构造一个更具描述性的注入令牌字符串。
   * 例如 moduleName 为 "Cache" 时返回 "CACHE_MODULE_OPTIONS"。
   *
   * @returns 形如 "<模块名大写下划线形式>_MODULE_OPTIONS" 的令牌字符串
   */
  private constructInjectionTokenString(): string {
    // 在每个大写字母前插入下划线分隔符，再整体转大写，得到 snake_case 形式
    const moduleNameInSnakeCase = this.options
      .moduleName!.trim()
      .split(/(?=[A-Z])/)
      .join('_')
      .toUpperCase();
    return `${moduleNameInSnakeCase}_MODULE_OPTIONS`;
  }

  /**
   * 动态构造"可配置模块类"的内部实现。
   *
   * 生成的类包含两个静态方法：
   * - 同步方法（默认 "register"）：接收普通选项对象，注册一个以注入令牌提供选项值的提供者；
   * - 异步方法（同步方法名 + "Async" 后缀，默认 "registerAsync"）：支持 useFactory /
   *   useExisting / useClass 三种异步配置方式。
   *
   * 通过闭包捕获 "self"（builder 实例）来访问构建器状态，
   * 最后将内部类断言为 "ConfigurableModuleCls" 类型返回。
   *
   * @returns 生成的可配置模块类
   */
  private createConfigurableModuleCls<ModuleOptions>(): ConfigurableModuleCls<
    ModuleOptions,
    StaticMethodKey,
    FactoryClassMethodKey
  > {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    // 异步静态方法名 = 同步方法名 + "Async" 后缀（如 "register" -> "registerAsync"）
    const asyncMethodKey = this.staticMethodKey + ASYNC_METHOD_SUFFIX;

    class InternalModuleClass {
      /**
       * 同步配置入口：接收普通模块选项对象，生成动态模块定义。
       *
       * @param options 模块选项（可能与 extras 类型有交集）
       * @returns 加工后的动态模块定义
       */
      static [self.staticMethodKey](
        options: ModuleOptions & ExtraModuleDefinitionOptions,
      ): DynamicModule {
        const providers: Array<Provider> = [
          {
            provide: self.options.optionsInjectionToken!,
            // 从用户选项中剥离 extras 的键，仅将真正的模块选项注册为提供者
            useValue: this.omitExtras(options, self.extras),
          },
        ];
        if (self.options.alwaysTransient) {
          // alwaysTransient 模式：注册一个随机 ID 提供者，确保每次调用都生成"唯一"的模块实例
          providers.push({
            provide: CONFIGURABLE_MODULE_ID,
            useValue: randomStringGenerator(),
          });
        }
        // 应用变换函数：extras 默认值 + 用户选项合并后作为 extraOptions 传入
        return self.transformModuleDefinition(
          {
            module: this,
            providers,
          },
          {
            ...self.extras,
            ...options,
          },
        );
      }

      /**
       * 异步配置入口：接收 ConfigurableModuleAsyncOptions 对象，
       * 支持 useFactory / useExisting / useClass 等异步配置方式。
       *
       * @param options 异步模块选项（可能与 extras 类型有交集）
       * @returns 加工后的动态模块定义
       */
      static [asyncMethodKey](
        options: ConfigurableModuleAsyncOptions<ModuleOptions> &
          ExtraModuleDefinitionOptions,
      ): DynamicModule {
        const providers = this.createAsyncProviders(options);
        if (self.options.alwaysTransient) {
          // 同样支持 alwaysTransient：每次生成唯一模块实例
          providers.push({
            provide: CONFIGURABLE_MODULE_ID,
            useValue: randomStringGenerator(),
          });
        }
        return self.transformModuleDefinition(
          {
            module: this,
            imports: options.imports || [],
            providers,
          },
          {
            ...self.extras,
            // 从异步选项中提取出用户显式指定的 extras 部分
            ...this.extractExtrasFromAsyncOptions(options, self.extras),
          },
        );
      }

      /**
       * 从合并后的输入对象中移除属于 extras 的键，
       * 只保留真正的模块选项（它们将作为选项提供者的值）。
       *
       * @param input 用户传入的完整选项对象（模块选项 + extras）
       * @param extras 构建器注册的额外选项对象
       * @returns 剥离 extras 后的纯模块选项对象
       */
      private static omitExtras(
        input: ModuleOptions & ExtraModuleDefinitionOptions,
        extras: ExtraModuleDefinitionOptions | undefined,
      ): ModuleOptions {
        if (!extras) {
          return input;
        }
        const moduleOptions = {};
        const extrasKeys = Object.keys(extras);

        // 仅收集不属于 extras 的键，构成纯净的模块选项
        Object.keys(input as object)
          .filter(key => !extrasKeys.includes(key))
          .forEach(key => {
            moduleOptions[key] = input[key];
          });
        return moduleOptions as ModuleOptions;
      }

      /**
       * 从异步选项对象中提取 extras 部分：
       * 剔除框架专用的异步配置键（useFactory、useClass 等），剩下的即用户显式传入的 extras。
       *
       * @param input 用户传入的异步选项对象
       * @param extras 构建器注册的额外选项对象（仅用于判断是否存在）
       * @returns 提取出的 extras 值集合
       */
      private static extractExtrasFromAsyncOptions(
        input: ConfigurableModuleAsyncOptions<ModuleOptions> &
          ExtraModuleDefinitionOptions,
        extras: ExtraModuleDefinitionOptions | undefined,
      ): Partial<ExtraModuleDefinitionOptions> {
        if (!extras) {
          return {};
        }
        const extrasOptions = {};

        // 排除异步选项专用的元数据键后，其余键均视为 extras
        Object.keys(input as object)
          .filter(key => !ASYNC_OPTIONS_METADATA_KEYS.includes(key as any))
          .forEach(key => {
            extrasOptions[key] = input[key];
          });

        return extrasOptions;
      }

      /**
       * 根据异步配置方式构造提供者数组：
       * - useFactory / useExisting：仅一个异步选项提供者；
       * - useClass：额外注册该工厂类本身的提供者（可被依赖注入实例化）；
       * - 若指定了 provideInjectionTokensFrom，还会从父模块提供者列表中
       *   挑选出 inject 所需的提供者一并注册。
       *
       * @param options 异步模块选项
       * @returns 需要注册到动态模块中的提供者数组
       */
      private static createAsyncProviders(
        options: ConfigurableModuleAsyncOptions<ModuleOptions> &
          ExtraModuleDefinitionOptions,
      ): Provider[] {
        if (options.useExisting || options.useFactory) {
          if (options.inject && options.provideInjectionTokensFrom) {
            // 异步选项提供者 + 从父模块提供者列表中筛选出的被注入依赖提供者
            return [
              this.createAsyncOptionsProvider(options),
              ...getInjectionProviders(
                options.provideInjectionTokensFrom,
                options.inject,
              ),
            ];
          }
          return [this.createAsyncOptionsProvider(options)];
        }
        // useClass 模式：除选项提供者外，还需注册工厂类本身，DI 容器才能实例化它
        return [
          this.createAsyncOptionsProvider(options),
          {
            provide: options.useClass!,
            useClass: options.useClass!,
          },
        ];
      }

      /**
       * 创建"异步选项提供者"：其职责是在运行时解析出模块选项对象，
       * 并以 optionsInjectionToken 为令牌提供。
       *
       * - useFactory：直接使用用户提供的工厂函数及其注入依赖；
       * - useExisting / useClass：注入工厂类实例，调用其工厂方法（默认 "create"）获取选项。
       *
       * @param options 异步模块选项
       * @returns 解析模块选项的工厂提供者
       */
      private static createAsyncOptionsProvider(
        options: ConfigurableModuleAsyncOptions<ModuleOptions>,
      ): Provider {
        if (options.useFactory) {
          return {
            provide: self.options.optionsInjectionToken!,
            useFactory: options.useFactory,
            inject: options.inject || [],
          };
        }
        return {
          provide: self.options.optionsInjectionToken!,
          useFactory: async (
            optionsFactory: ConfigurableModuleOptionsFactory<
              ModuleOptions,
              FactoryClassMethodKey
            >,
          ) =>
            await optionsFactory[
              // 动态调用工厂类上由 factoryClassMethodKey 指定的方法（默认 "create"）
              self.factoryClassMethodKey as keyof typeof optionsFactory
            ](),
          inject: [options.useExisting || options.useClass!],
        };
      }
    }
    return InternalModuleClass as unknown as ConfigurableModuleCls<
      ModuleOptions,
      StaticMethodKey,
      FactoryClassMethodKey
    >;
  }

  /**
   * 创建一个"仅用于类型推断"的代理对象（OPTIONS_TYPE / ASYNC_OPTIONS_TYPE）。
   * 这些属性仅供 TypeScript 类型层面使用（typeof OPTIONS_TYPE），
   * 一旦在运行时被当作值访问就会抛出错误，防止误用。
   *
   * @param typeName 类型名称，用于错误提示
   * @returns 一个任何属性访问都会抛错的 Proxy 对象
   */
  private createTypeProxy(
    typeName: 'OPTIONS_TYPE' | 'ASYNC_OPTIONS_TYPE' | 'OptionsFactoryInterface',
  ) {
    const proxy = new Proxy(
      {},
      {
        get: () => {
          throw new Error(
            `"${typeName}" is not supposed to be used as a value.`,
          );
        },
      },
    );
    return proxy as any;
  }
}
