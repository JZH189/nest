import { RENDER_METADATA } from '../../constants';

/**
 * 路由处理程序方法装饰器。定义由控制器渲染的模板。
 *
 * 例如: `@Render('index')`
 *
 * @param template 渲染引擎模板文件的名称
 *
 * @see [模型-视图-控制器](https://docs.nestjs.cn/techniques/mvc)
 *
 * @publicApi
 */
export function Render(template: string): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    Reflect.defineMetadata(RENDER_METADATA, template, descriptor.value);
    return descriptor;
  };
}
