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
  protected staticMethodKey: StaticMethodKey;
  protected factoryClassMethodKey: FactoryClassMethodKey;
  protected extras: ExtraModuleDefinitionOptions;
  protected transformModuleDefinition: (
    definition: DynamicModule,
    extraOptions: ExtraModuleDefinitionOptions,
  ) => DynamicModule;

  protected readonly logger = new Logger(ConfigurableModuleBuilder.name);

  constructor(
    protected readonly options: ConfigurableModuleBuilderOptions = {},
    parentBuilder?: ConfigurableModuleBuilder<ModuleOptions>,
  ) {
    if (parentBuilder) {
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
    this.staticMethodKey ??= DEFAULT_METHOD_KEY as StaticMethodKey;
    this.factoryClassMethodKey ??=
      DEFAULT_FACTORY_CLASS_METHOD_KEY as FactoryClassMethodKey;
    this.options.optionsInjectionToken ??= this.options.moduleName
      ? this.constructInjectionTokenString()
      : generateOptionsInjectionToken();
    this.transformModuleDefinition ??= definition => definition;

    return {
      ConfigurableModuleClass:
        this.createConfigurableModuleCls<ModuleOptions>(),
      MODULE_OPTIONS_TOKEN: this.options.optionsInjectionToken,
      ASYNC_OPTIONS_TYPE: this.createTypeProxy('ASYNC_OPTIONS_TYPE'),
      OPTIONS_TYPE: this.createTypeProxy('OPTIONS_TYPE'),
    };
  }

  private constructInjectionTokenString(): string {
    const moduleNameInSnakeCase = this.options
      .moduleName!.trim()
      .split(/(?=[A-Z])/)
      .join('_')
      .toUpperCase();
    return `${moduleNameInSnakeCase}_MODULE_OPTIONS`;
  }

  private createConfigurableModuleCls<ModuleOptions>(): ConfigurableModuleCls<
    ModuleOptions,
    StaticMethodKey,
    FactoryClassMethodKey
  > {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const asyncMethodKey = this.staticMethodKey + ASYNC_METHOD_SUFFIX;

    class InternalModuleClass {
      static [self.staticMethodKey](
        options: ModuleOptions & ExtraModuleDefinitionOptions,
      ): DynamicModule {
        const providers: Array<Provider> = [
          {
            provide: self.options.optionsInjectionToken!,
            useValue: this.omitExtras(options, self.extras),
          },
        ];
        if (self.options.alwaysTransient) {
          providers.push({
            provide: CONFIGURABLE_MODULE_ID,
            useValue: randomStringGenerator(),
          });
        }
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

      static [asyncMethodKey](
        options: ConfigurableModuleAsyncOptions<ModuleOptions> &
          ExtraModuleDefinitionOptions,
      ): DynamicModule {
        const providers = this.createAsyncProviders(options);
        if (self.options.alwaysTransient) {
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
            ...this.extractExtrasFromAsyncOptions(options, self.extras),
          },
        );
      }

      private static omitExtras(
        input: ModuleOptions & ExtraModuleDefinitionOptions,
        extras: ExtraModuleDefinitionOptions | undefined,
      ): ModuleOptions {
        if (!extras) {
          return input;
        }
        const moduleOptions = {};
        const extrasKeys = Object.keys(extras);

        Object.keys(input as object)
          .filter(key => !extrasKeys.includes(key))
          .forEach(key => {
            moduleOptions[key] = input[key];
          });
        return moduleOptions as ModuleOptions;
      }

      private static extractExtrasFromAsyncOptions(
        input: ConfigurableModuleAsyncOptions<ModuleOptions> &
          ExtraModuleDefinitionOptions,
        extras: ExtraModuleDefinitionOptions | undefined,
      ): Partial<ExtraModuleDefinitionOptions> {
        if (!extras) {
          return {};
        }
        const extrasOptions = {};

        Object.keys(input as object)
          .filter(key => !ASYNC_OPTIONS_METADATA_KEYS.includes(key as any))
          .forEach(key => {
            extrasOptions[key] = input[key];
          });

        return extrasOptions;
      }

      private static createAsyncProviders(
        options: ConfigurableModuleAsyncOptions<ModuleOptions> &
          ExtraModuleDefinitionOptions,
      ): Provider[] {
        if (options.useExisting || options.useFactory) {
          if (options.inject && options.provideInjectionTokensFrom) {
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
        return [
          this.createAsyncOptionsProvider(options),
          {
            provide: options.useClass!,
            useClass: options.useClass!,
          },
        ];
      }

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
