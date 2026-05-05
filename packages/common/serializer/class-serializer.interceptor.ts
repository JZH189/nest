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

let classTransformer: TransformerPackage = {} as any;

export interface PlainLiteralObject {
  [key: string]: any;
}

// 注意 (external)
// 由于 core 和 common 包之间的循环依赖，我们需要在这里对它们进行去重
const REFLECTOR = 'Reflector';

/**
 * @publicApi
 */
export interface ClassSerializerInterceptorOptions extends ClassTransformOptions {
  transformerPackage?: TransformerPackage;
}

/**
 * @publicApi
 */
@Injectable()
export class ClassSerializerInterceptor implements NestInterceptor {
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

  protected getContextOptions(
    context: ExecutionContext,
  ): ClassSerializerContextOptions | undefined {
    return this.reflector.getAllAndOverride(CLASS_SERIALIZER_OPTIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
