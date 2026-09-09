import {
  CallHandler,
  ExecutionContext,
  Inject,
  mixin,
  NestInterceptor,
  Optional,
  Type,
} from '@nestjs/common';
import * as multer from 'multer';
import { Observable } from 'rxjs';
import { MULTER_MODULE_OPTIONS } from '../files.constants';
import { MulterModuleOptions } from '../interfaces';
import { MulterOptions } from '../interfaces/multer-options.interface';
import { transformException } from '../multer/multer.utils';

type MulterInstance = any;

/**
 * 单文件上传拦截器工厂（@publicApi）。
 *
 * 基于 mixin 模式动态创建拦截器类：实例化时把 MulterModule 全局配置与
 * localOptions 合并后创建 multer 实例；拦截请求时调用 multer 的 single()
 * 中间件把指定字段的单个文件解析并挂到 req.file 上，随后放行到路由处理函数。
 * 底层错误会经 transformException 转换为 NestJS HTTP 异常。
 *
 * @param fieldName - 表单中文件字段的名称
 * @param localOptions - 当前拦截器私有的 multer 配置（覆盖全局配置）
 * @returns 可直接挂载到路由的拦截器类型
 * @publicApi
 */
export function FileInterceptor(
  fieldName: string,
  localOptions?: MulterOptions,
): Type<NestInterceptor> {
  class MixinInterceptor implements NestInterceptor {
    protected multer: MulterInstance;

    constructor(
      @Optional()
      @Inject(MULTER_MODULE_OPTIONS)
      options: MulterModuleOptions = {},
    ) {
      this.multer = (multer as any)({
        ...options,
        ...localOptions,
      });
    }

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<any>> {
      const ctx = context.switchToHttp();

      await new Promise<void>((resolve, reject) =>
        this.multer.single(fieldName)(
          ctx.getRequest(),
          ctx.getResponse(),
          (err: any) => {
            if (err) {
              const error = transformException(err);
              return reject(error);
            }
            resolve();
          },
        ),
      );
      return next.handle();
    }
  }
  const Interceptor = mixin(MixinInterceptor);
  return Interceptor;
}
