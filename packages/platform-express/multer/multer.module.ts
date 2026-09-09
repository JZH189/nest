import { DynamicModule, Module, Provider } from '@nestjs/common';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { MULTER_MODULE_OPTIONS } from './files.constants';
import {
  MulterModuleAsyncOptions,
  MulterModuleOptions,
  MulterOptionsFactory,
} from './interfaces/files-upload-module.interface';
import { MULTER_MODULE_ID } from './multer.constants';

/**
 * Multer 文件上传的配置模块（@publicApi）。
 *
 * 提供同步（register）与异步（registerAsync）两种注册方式，
 * 把 MulterModuleOptions 以 MULTER_MODULE_OPTIONS 令牌注册到 IoC 容器，
 * 供各文件上传拦截器（FileInterceptor 等）在实例化 multer 时合并使用。
 */
@Module({})
export class MulterModule {
  /**
   * 同步注册 MulterModule，直接使用传入的配置对象。
   *
   * @param options - multer 全局配置项（如存储引擎、上传目录 dest 等），默认空对象
   * @returns 动态模块定义，导出 MULTER_MODULE_OPTIONS 供其他模块消费
   */
  static register(options: MulterModuleOptions = {}): DynamicModule {
    return {
      module: MulterModule,
      providers: [
        { provide: MULTER_MODULE_OPTIONS, useFactory: () => options },
        {
          provide: MULTER_MODULE_ID,
          useValue: randomStringGenerator(),
        },
      ],
      exports: [MULTER_MODULE_OPTIONS],
    };
  }

  /**
   * 异步注册 MulterModule，配置可来自其他模块（imports）、
   * 工厂函数（useFactory）或已存在的配置工厂类（useExisting/useClass）。
   *
   * @param options - 异步模块配置（imports、useExisting/useClass/useFactory、inject）
   * @returns 动态模块定义，导出 MULTER_MODULE_OPTIONS 供其他模块消费
   */
  static registerAsync(options: MulterModuleAsyncOptions): DynamicModule {
    return {
      module: MulterModule,
      imports: options.imports,
      providers: [
        ...this.createAsyncProviders(options),
        {
          provide: MULTER_MODULE_ID,
          useValue: randomStringGenerator(),
        },
      ],
      exports: [MULTER_MODULE_OPTIONS],
    };
  }

  /**
   * 根据异步配置构建 Provider 列表。
   *
   * @param options - 异步模块配置
   * @returns 异步配置 Provider（以及 useClass 时额外的工厂类 Provider）
   */
  private static createAsyncProviders(
    options: MulterModuleAsyncOptions,
  ): Provider[] {
    // 1. 使用已有工厂实例或工厂函数时，仅需一个异步配置 Provider
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }
    // 2. 使用 useClass 时，同时注册该工厂类，使其依赖可被容器解析
    return [
      this.createAsyncOptionsProvider(options),
      {
        provide: options.useClass!,
        useClass: options.useClass!,
      },
    ];
  }

  /**
   * 创建最终产出 MULTER_MODULE_OPTIONS 的异步配置 Provider。
   *
   * @param options - 异步模块配置
   * @returns useFactory 直接复用；否则通过 useExisting/useClass 工厂调用 createMulterOptions()
   */
  private static createAsyncOptionsProvider(
    options: MulterModuleAsyncOptions,
  ): Provider {
    // 1. 优先使用用户提供的工厂函数
    if (options.useFactory) {
      return {
        provide: MULTER_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }
    // 2. 否则注入工厂类实例并调用其 createMulterOptions() 生成配置
    return {
      provide: MULTER_MODULE_OPTIONS,
      useFactory: async (optionsFactory: MulterOptionsFactory) =>
        optionsFactory.createMulterOptions(),
      inject: [options.useExisting || options.useClass!],
    };
  }
}
