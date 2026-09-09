import { Type } from '../type.interface';
import { Paramtype } from './paramtype.interface';

/**
 * 简单转换函数的类型：接收参数值与其元数据，返回转换/校验后的值。
 * 常用于 `@Body()` 等装饰器的第二参数（如 `ParseArrayPipe` 内部），
 * 也用于 `PipeTransform#transform` 的方法引用。
 */
export type Transform<T = any> = (value: T, metadata: ArgumentMetadata) => any;

/**
 * 描述管道实现的 `transform()` 方法元数据参数的接口。
 *
 * @see [管道](https://docs.nestjs.cn/pipes)
 *
 * @publicApi
 */
export interface ArgumentMetadata {
  /**
   * 指示参数是 body、query、param 还是自定义参数
   */
  readonly type: Paramtype;
  /**
   * 参数的底层基本类型（例如 `String`），基于路由处理程序中的类型定义。
   */
  readonly metatype?: Type<any> | undefined;
  /**
   * 作为参数传递给装饰器的字符串。
   * 示例：`@Body('userId')` 会产生 `userId`
   */
  readonly data?: string | undefined;
}

/**
 * 描述管道实现的接口。
 *
 * @see [管道](https://docs.nestjs.cn/pipes)
 *
 * @publicApi
 */
export interface PipeTransform<T = any, R = any> {
  /**
   * 实现自定义管道的方法。接收两个参数
   *
   * @param value 在被路由处理程序方法接收之前的参数值
   * @param metadata 包含有关该值的元数据
   */
  transform(value: T, metadata: ArgumentMetadata): R;
}
