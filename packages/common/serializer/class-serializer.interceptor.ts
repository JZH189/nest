import { ClassSerializerContextOptions } from './class-serializer.interfaces';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Inject, Injectable, Optional } from '../decorators/core';
import { StreamableFile } from '../file-stream';
import { CallHandler, ExecutionContext, NestInterceptor } from '../interfaces';
import { ClassTransformOptions } from '../interfaces/external/class-transform-options.interface';
import { TransformerPackage } from '../interfaces/external/transformer-package.interface';
import { loadPackage } from '../utils/load-package.util';
import { isObject } from '../utils/shared.utils';
import { CLASS_SERIALIZER_OPTIONS } from './class-serializer.constants';

/**
 * 转换器包（class-transformer）的模块级引用，
 * 在 ClassSerializerInterceptor 构造时通过 loadPackage 动态加载
 */
let classTransformer: TransformerPackage = {} as any;

/**
 * 表示"普通字面量对象"的类型（键值对形式的纯对象）
 */
export interface PlainLiteralObject {
  [key: string]: any;
}

// 注意 (external)
// 由于 core 和 common 包之间的循环依赖，我们需要在这里对它们进行去重
const REFLECTOR = 'Reflector';

/**
 * ClassSerializerInterceptor 的配置选项
 *
 * @publicApi
 */
export interface ClassSerializerInterceptorOptions extends ClassTransformOptions {
  /** 显式指定的转换器包（默认动态加载 class-transformer） */
  transformerPackage?: TransformerPackage;
}

/**
 * 定义内置的 ClassSerializerInterceptor（类序列化拦截器）
 *
 * 该拦截器集成了 class-transformer：在响应数据返回给客户端之前，
 * 将其从 DTO/实体类实例转换为普通对象（plain object），
 * 从而使 @Exclude()/@Expose() 等 class-transformer 装饰器生效——
 * 被 @Exclude 标记的属性会在序列化时被剔除，@Expose 可定义虚拟属性。
 * 也可通过 @SerializeOptions() 装饰器为路由处理器/控制器配置序列化选项。
 *
 * 序列化时机：拦截器在路由处理器执行完毕后、响应写出之前，
 * 通过 RxJS 的 map 操作符对响应流做序列化处理。
 *
 * @see [序列化](https://docs.nestjs.cn/techniques/serialization)
 *
 * @publicApi
 */
@Injectable()
export class ClassSerializerInterceptor implements NestInterceptor {
  /**
   * 构造函数：加载 class-transformer 包并保存默认序列化选项
   *
   * @param reflector Reflector 实例，用于读取 @SerializeOptions() 元数据
   * @param defaultOptions 默认序列化选项
   */
  constructor(
    @Inject(REFLECTOR) protected readonly reflector: any,
    @Optional()
    protected readonly defaultOptions: ClassSerializerInterceptorOptions = {},
  ) {
    classTransformer =
      defaultOptions?.transformerPackage ??
      loadPackage('class-transformer', 'ClassSerializerInterceptor', () =>
        require('class-transformer'),
      );

    if (!defaultOptions?.transformerPackage) {
      require('class-transformer');
    }
  }

  /**
   * 拦截器核心方法：合并默认选项与 @SerializeOptions() 提供的上下文选项，
   * 并在路由处理器返回响应后（RxJS 流的 map 阶段）执行序列化。
   *
   * @param context 当前执行上下文（处理器/类等元信息）
   * @param next 调用链中的下一个处理器，调用其 handle() 可获得路由处理器返回的响应流
   * @returns 经过序列化处理的响应流
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const contextOptions = this.getContextOptions(context);
    const options = {
      ...this.defaultOptions,
      ...contextOptions,
    };
    return next
      .handle()
      .pipe(
        map((res: PlainLiteralObject | Array<PlainLiteralObject>) =>
          this.serialize(res, options),
        ),
      );
  }

  /**
   * 序列化既不是空对象也不是可流式传输文件的响应。
   * 数组响应会逐项序列化；非对象响应与 StreamableFile 原样返回。
   *
   * @param response 路由处理器返回的响应对象（或数组）
   * @param options 合并后的序列化选项
   * @returns 序列化后的普通对象（或对象数组）
   */
  serialize(
    response: PlainLiteralObject | Array<PlainLiteralObject>,
    options: ClassSerializerContextOptions,
  ): PlainLiteralObject | Array<PlainLiteralObject> {
    if (!isObject(response) || response instanceof StreamableFile) {
      return response;
    }

    return Array.isArray(response)
      ? response.map(item => this.transformToPlain(item, options))
      : this.transformToPlain(response, options);
  }

  /**
   * 用 class-transformer 把类实例转换为普通对象（使 @Exclude/@Expose 生效）。
   * 若指定了 `options.type` 且响应不是该类的实例，
   * 会先 plainToInstance 转换为该类实例，再 classToPlain 序列化。
   *
   * @param plainOrClass 待序列化的普通对象或类实例
   * @param options 序列化选项（可含 `type` 指定期望的类）
   * @returns 序列化后的普通字面量对象
   */
  transformToPlain(
    plainOrClass: any,
    options: ClassSerializerContextOptions,
  ): PlainLiteralObject {
    if (!plainOrClass) {
      return plainOrClass;
    }
    if (!options.type) {
      return classTransformer.classToPlain(plainOrClass, options);
    }
    if (plainOrClass instanceof options.type) {
      return classTransformer.classToPlain(plainOrClass, options);
    }
    const instance = classTransformer.plainToInstance(
      options.type,
      plainOrClass,
      options,
    );
    return classTransformer.classToPlain(instance, options);
  }

  /**
   * 读取当前执行上下文上的序列化选项元数据：
   * 依次检查路由处理器方法与控制器类上的 @SerializeOptions()（方法优先）
   *
   * @param context 当前执行上下文
   * @returns 序列化选项（未设置时为 `undefined`）
   */
  protected getContextOptions(
    context: ExecutionContext,
  ): ClassSerializerContextOptions | undefined {
    return this.reflector.getAllAndOverride(CLASS_SERIALIZER_OPTIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
