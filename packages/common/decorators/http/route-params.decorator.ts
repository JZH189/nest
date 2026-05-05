import {
  RESPONSE_PASSTHROUGH_METADATA,
  ROUTE_ARGS_METADATA,
} from '../../constants';
import { RouteParamtypes } from '../../enums/route-paramtypes.enum';
import { PipeTransform } from '../../index';
import { Type } from '../../interfaces';
import { isNil, isString } from '../../utils/shared.utils';

/**
 * `@Response()`/`@Res` 参数装饰器选项。
 */
export interface ResponseDecoratorOptions {
  /**
   * 确定响应是由路由处理程序内部手动发送(使用特定平台响应对象公开的本机响应处理方法)，
   * 还是应该通过 Nest 响应处理管道传递。
   *
   * @default false
   */
  passthrough: boolean;
}

export type ParamData = object | string | number;
export interface RouteParamMetadata {
  index: number;
  data?: ParamData;
}

export function assignMetadata<TParamtype = any, TArgs = any>(
  args: TArgs,
  paramtype: TParamtype,
  index: number,
  data?: ParamData,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
) {
  return {
    ...args,
    [`${paramtype as string}:${index}`]: {
      index,
      data,
      pipes,
    },
  };
}

function createRouteParamDecorator(paramtype: RouteParamtypes) {
  return (data?: ParamData): ParameterDecorator =>
    (target, key, index) => {
      const args =
        Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key!) ||
        {};
      Reflect.defineMetadata(
        ROUTE_ARGS_METADATA,
        assignMetadata<RouteParamtypes, Record<number, RouteParamMetadata>>(
          args,
          paramtype,
          index,
          data,
        ),
        target.constructor,
        key!,
      );
    };
}

const createPipesRouteParamDecorator =
  (paramtype: RouteParamtypes) =>
  (
    data?: any,
    ...pipes: (Type<PipeTransform> | PipeTransform)[]
  ): ParameterDecorator =>
  (target, key, index) => {
    const args =
      Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key!) || {};
    const hasParamData = isNil(data) || isString(data);
    const paramData = hasParamData ? data : undefined;
    const paramPipes = hasParamData ? pipes : [data, ...pipes];

    Reflect.defineMetadata(
      ROUTE_ARGS_METADATA,
      assignMetadata(args, paramtype, index, paramData!, ...paramPipes),
      target.constructor,
      key!,
    );
  };

/**
 * 路由处理程序参数装饰器。从底层平台提取 `Request`
 * 对象，并用 `Request` 的值填充被装饰的参数。
 *
 * 示例: `logout(@Request() req)`
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export const Request: () => ParameterDecorator = createRouteParamDecorator(
  RouteParamtypes.REQUEST,
);

/**
 * 路由处理程序参数装饰器。从底层平台提取 `Response`
 * 对象，并用 `Response` 的值填充被装饰的参数。
 *
 * 示例: `logout(@Response() res)`
 *
 * @publicApi
 */
export const Response: (
  options?: ResponseDecoratorOptions,
) => ParameterDecorator =
  (options?: ResponseDecoratorOptions) => (target, key, index) => {
    if (options?.passthrough) {
      Reflect.defineMetadata(
        RESPONSE_PASSTHROUGH_METADATA,
        options?.passthrough,
        target.constructor,
        key!,
      );
    }
    return createRouteParamDecorator(RouteParamtypes.RESPONSE)()(
      target,
      key,
      index,
    );
  };

/**
 * 路由处理程序参数装饰器。从底层平台提取对 `Next` 函数的引用，
 * 并用 `Next` 的值填充被装饰的参数。
 *
 * @publicApi
 */
export const Next: () => ParameterDecorator = createRouteParamDecorator(
  RouteParamtypes.NEXT,
);

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `Ip` 属性，
 * 并用 `ip` 的值填充被装饰的参数。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export const Ip: () => ParameterDecorator = createRouteParamDecorator(
  RouteParamtypes.IP,
);

/**
 * 路由处理程序参数装饰器。从底层平台提取 `Session` 对象，
 * 并用 `Session` 的值填充被装饰的参数。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export const Session: () => ParameterDecorator = createRouteParamDecorator(
  RouteParamtypes.SESSION,
);

/**
 * 路由处理程序参数装饰器。提取 `file` 对象，
 * 并用 `file` 的值填充被装饰的参数。
 * 与基于 Express 的应用程序的[multer 中间件](https://github.com/expressjs/multer)配合使用。
 *
 * 例如:
 * ```typescript
 * uploadFile(@UploadedFile() file) {
 *   console.log(file);
 * }
 * ```
 * @see [请求对象](https://docs.nestjs.cn/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFile(): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。提取 `file` 对象，
 * 并用 `file` 的值填充被装饰的参数。
 * 与基于 Express 的应用程序的[multer 中间件](https://github.com/expressjs/multer)配合使用。
 *
 * 例如:
 * ```typescript
 * uploadFile(@UploadedFile() file) {
 *   console.log(file);
 * }
 * ```
 * @see [请求对象](https://docs.nestjs.cn/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFile(
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;

/**
 * 路由处理程序参数装饰器。提取 `file` 对象，
 * 并用 `file` 的值填充被装饰的参数。
 * 与基于 Express 的应用程序的[multer 中间件](https://github.com/expressjs/multer)配合使用。
 *
 * 例如:
 * ```typescript
 * uploadFile(@UploadedFile() file) {
 *   console.log(file);
 * }
 * ```
 * @see [请求对象](https://docs.nestjs.cn/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFile(
  fileKey?: string,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。提取 `file` 对象，
 * 并用 `file` 的值填充被装饰的参数。
 * 与基于 Express 的应用程序的[multer 中间件](https://github.com/expressjs/multer)配合使用。
 *
 * 例如:
 * ```typescript
 * uploadFile(@UploadedFile() file) {
 *   console.log(file);
 * }
 * ```
 * @see [请求对象](https://docs.nestjs.cn/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFile(
  fileKey?: string | (Type<PipeTransform> | PipeTransform),
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamtypes.FILE)(
    fileKey,
    ...pipes,
  );
}

/**
 * 路由处理程序参数装饰器。提取 `files` 对象，
 * 并用 `files` 的值填充被装饰的参数。
 * 与基于 Express 的应用程序的[multer 中间件](https://github.com/expressjs/multer)配合使用。
 *
 * 例如:
 * ```typescript
 * uploadFile(@UploadedFiles() files) {
 *   console.log(files);
 * }
 * ```
 * @see [请求对象](https://docs.nestjs.cn/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFiles(): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。提取 `files` 对象，
 * 并用 `files` 的值填充被装饰的参数。
 * 与基于 Express 的应用程序的[multer 中间件](https://github.com/expressjs/multer)配合使用。
 *
 * 例如:
 * ```typescript
 * uploadFile(@UploadedFiles() files) {
 *   console.log(files);
 * }
 * ```
 * @see [请求对象](https://docs.nestjs.cn/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFiles(
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。提取 `files` 对象，
 * 并用 `files` 的值填充被装饰的参数。
 * 与基于 Express 的应用程序的[multer 中间件](https://github.com/expressjs/multer)配合使用。
 *
 * 例如:
 * ```typescript
 * uploadFile(@UploadedFiles() files) {
 *   console.log(files);
 * }
 * ```
 * @see [请求对象](https://docs.nestjs.cn/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFiles(
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamtypes.FILES)(
    undefined,
    ...pipes,
  );
}

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `headers`
 * 属性，并用 `headers` 的值填充被装饰的参数。
 *
 * 例如: `async update(@Headers('Cache-Control') cacheControl: string)`
 *
 * @param property 要提取的单个 header 属性的名称。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export const Headers: (property?: string) => ParameterDecorator =
  createRouteParamDecorator(RouteParamtypes.HEADERS);

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `query`
 * 属性，并用 `query` 的值填充被装饰的参数。
 * 还可以对绑定的查询参数应用管道。
 *
 * 例如:
 * ```typescript
 * async find(@Query('user') user: string)
 * ```
 *
 * @param property 要从 `query` 对象中提取的单个属性的名称
 * @param pipes 要应用于绑定查询参数的一个或多个管道
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export function Query(): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `query`
 * 属性，并用 `query` 的值填充被装饰的参数。
 * 还可以对绑定的查询参数应用管道。
 *
 * 例如:
 * ```typescript
 * async find(@Query('user') user: string)
 * ```
 *
 * @param property 要从 `query` 对象中提取的单个属性的名称
 * @param pipes 要应用于绑定查询参数的一个或多个管道
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export function Query(
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `query`
 * 属性，并用 `query` 的值填充被装饰的参数。
 * 还可以对绑定的查询参数应用管道。
 *
 * 例如:
 * ```typescript
 * async find(@Query('user') user: string)
 * ```
 *
 * @param property 要从 `query` 对象中提取的单个属性的名称
 * @param pipes 要应用于绑定查询参数的一个或多个管道
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export function Query(
  property: string,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `query`
 * 属性，并用 `query` 的值填充被装饰的参数。
 * 还可以对绑定的查询参数应用管道。
 *
 * 例如:
 * ```typescript
 * async find(@Query('user') user: string)
 * ```
 *
 * @param property 要从 `query` 对象中提取的单个属性的名称
 * @param pipes 要应用于绑定查询参数的一个或多个管道
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export function Query(
  property?: string | (Type<PipeTransform> | PipeTransform),
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamtypes.QUERY)(
    property,
    ...pipes,
  );
}

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取整个 `body`
 * 对象，并用 `body` 的值填充被装饰的参数。
 *
 * 例如:
 * ```typescript
 * async create(@Body() createDto: CreateCatDto)
 * ```
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export function Body(): ParameterDecorator;

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取整个 `body`
 * 对象，并用 `body` 的值填充被装饰的参数。
 * 还可以对该参数应用指定的管道。
 *
 * 例如:
 * ```typescript
 * async create(@Body(new ValidationPipe()) createDto: CreateCatDto)
 * ```
 *
 * @param pipes 一个或多个要应用于绑定 body 参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Body(
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;

/**
 * 路由处理程序参数装饰器。从 `req` 对象的 `body` 对象属性中提取单个属性，
 * 并用该属性的值填充被装饰的参数。还可以对绑定的 body 参数应用管道。
 *
 * 例如:
 * ```typescript
 * async create(@Body('role', new ValidationPipe()) role: string)
 * ```
 *
 * @param property 要从 `body` 对象中提取的单个属性的名称
 * @param pipes 一个或多个要应用于绑定 body 参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Body(
  property: string,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取整个 `body` 对象属性，
 * 或可选的 `body` 对象的命名属性，并用该值填充被装饰的参数。
 * 还可以对绑定的 body 参数应用管道。
 *
 * 例如:
 * ```typescript
 * async create(@Body('role', new ValidationPipe()) role: string)
 * ```
 *
 * @param property 要从 `body` 对象中提取的单个属性的名称
 * @param pipes 一个或多个要应用于绑定 body 参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Body(
  property?: string | (Type<PipeTransform> | PipeTransform),
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamtypes.BODY)(
    property,
    ...pipes,
  );
}

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `rawBody` Buffer 属性，
 * 并用该值填充被装饰的参数。
 *
 * 例如:
 * ```typescript
 * async create(@RawBody() rawBody: Buffer | undefined)
 * ```
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [原始 body](https://docs.nestjs.cn/faq/raw-body)
 *
 * @publicApi
 */
export function RawBody(): ParameterDecorator;

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `rawBody` Buffer 属性，
 * 并用该值填充被装饰的参数。还可以对绑定的 rawBody 参数应用管道。
 *
 * 例如:
 * ```typescript
 * async create(@RawBody(new ValidationPipe()) rawBody: Buffer)
 * ```
 *
 * @param pipes 一个或多个要应用于绑定 body 参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [原始 body](https://docs.nestjs.cn/faq/raw-body)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function RawBody(
  ...pipes: (
    | Type<PipeTransform<Buffer | undefined>>
    | PipeTransform<Buffer | undefined>
  )[]
): ParameterDecorator;

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `rawBody` Buffer 属性，
 * 并用该值填充被装饰的参数。还可以对绑定的 rawBody 参数应用管道。
 *
 * 例如:
 * ```typescript
 * async create(@RawBody(new ValidationPipe()) rawBody: Buffer)
 * ```
 *
 * @param pipes 一个或多个要应用于绑定 body 参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [原始 body](https://docs.nestjs.cn/faq/raw-body)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function RawBody(
  ...pipes: (
    | Type<PipeTransform<Buffer | undefined>>
    | PipeTransform<Buffer | undefined>
  )[]
): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamtypes.RAW_BODY)(
    undefined,
    ...pipes,
  );
}

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `params`
 * 属性，并用 `params` 的值填充被装饰的参数。
 * 还可以对绑定的参数应用管道。
 *
 * 例如，提取所有参数:
 * ```typescript
 * findOne(@Param() params: string[])
 * ```
 *
 * 例如，提取单个参数:
 * ```typescript
 * findOne(@Param('id') id: string)
 * ```
 * @param property 要从 `req` 对象中提取的单个属性的名称
 * @param pipes 一个或多个要应用于绑定参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Param(): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `params`
 * 属性，并用 `params` 的值填充被装饰的参数。
 * 还可以对绑定的参数应用管道。
 *
 * 例如，提取所有参数:
 * ```typescript
 * findOne(@Param() params: string[])
 * ```
 *
 * 例如，提取单个参数:
 * ```typescript
 * findOne(@Param('id') id: string)
 * ```
 * @param property 要从 `req` 对象中提取的单个属性的名称
 * @param pipes 一个或多个要应用于绑定参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Param(
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `params`
 * 属性，并用 `params` 的值填充被装饰的参数。
 * 还可以对绑定的参数应用管道。
 *
 * 例如，提取所有参数:
 * ```typescript
 * findOne(@Param() params: string[])
 * ```
 *
 * 例如，提取单个参数:
 * ```typescript
 * findOne(@Param('id') id: string)
 * ```
 * @param property 要从 `req` 对象中提取的单个属性的名称
 * @param pipes 一个或多个要应用于绑定参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Param(
  property: string,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `params`
 * 属性，并用 `params` 的值填充被装饰的参数。
 * 还可以对绑定的参数应用管道。
 *
 * 例如，提取所有参数:
 * ```typescript
 * findOne(@Param() params: string[])
 * ```
 *
 * 例如，提取单个参数:
 * ```typescript
 * findOne(@Param('id') id: string)
 * ```
 * @param property 要从 `req` 对象中提取的单个属性的名称
 * @param pipes 一个或多个要应用于绑定参数的管道(实例或类)。
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 * @see [使用管道](https://docs.nestjs.cn/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Param(
  property?: string | (Type<PipeTransform> | PipeTransform),
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamtypes.PARAM)(
    property,
    ...pipes,
  );
}

/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `hosts`
 * 属性，并用 `hosts` 的值填充被装饰的参数。
 * 还可以对绑定的参数应用管道。
 *
 * 例如，提取所有参数:
 * ```typescript
 * findOne(@HostParam() params: string[])
 * ```
 *
 * 例如，提取单个参数:
 * ```typescript
 * findOne(@HostParam('id') id: string)
 * ```
 * @param property 要从 `req` 对象中提取的单个属性的名称
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export function HostParam(): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `hosts`
 * 属性，并用 `hosts` 的值填充被装饰的参数。
 * 还可以对绑定的参数应用管道。
 *
 * 例如，提取所有参数:
 * ```typescript
 * findOne(@HostParam() params: string[])
 * ```
 *
 * 例如，提取单个参数:
 * ```typescript
 * findOne(@HostParam('id') id: string)
 * ```
 * @param property 要从 `req` 对象中提取的单个属性的名称
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export function HostParam(property: string): ParameterDecorator;
/**
 * 路由处理程序参数装饰器。从 `req` 对象中提取 `hosts`
 * 属性，并用 `params` 的值填充被装饰的参数。
 * 还可以对绑定的参数应用管道。
 *
 * 例如，提取所有参数:
 * ```typescript
 * findOne(@HostParam() params: string[])
 * ```
 *
 * 例如，提取单个参数:
 * ```typescript
 * findOne(@HostParam('id') id: string)
 * ```
 * @param property 要从 `req` 对象中提取的单个属性的名称
 *
 * @see [请求对象](https://docs.nestjs.cn/controllers#request-object)
 *
 * @publicApi
 */
export function HostParam(
  property?: string | (Type<PipeTransform> | PipeTransform),
): ParameterDecorator {
  return createRouteParamDecorator(RouteParamtypes.HOST)(property);
}

export const Req = Request;
export const Res = Response;
