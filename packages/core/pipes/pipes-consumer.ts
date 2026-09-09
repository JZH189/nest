import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ArgumentMetadata, PipeTransform } from '@nestjs/common/interfaces';
import { ParamsTokenFactory } from './params-token-factory';

/**
 * 管道消费器（Pipes Consumer）：真正"执行"管道链的组件。
 *
 * 在框架中的角色：在守卫与拦截器之后、处理器方法体之前执行，
 * 依次把管道应用到路由参数上，完成参数的转换（transformation）
 * 与校验（validation），管道抛出的异常由异常过滤器接管。
 */
export class PipesConsumer {
  /** 参数类型映射工厂，用于生成 ArgumentMetadata.type。 */
  private readonly paramsTokenFactory = new ParamsTokenFactory();

  /**
   * 对单个参数应用管道链：先把内部枚举转换为参数类型字符串，
   * 再交由 applyPipes 依次执行管道。
   *
   * @param value - 当前参数的原始值。
   * @param metadata - 参数元数据（元类型、类型、装饰器数据）。
   * @param pipes - 该参数上生效的管道实例数组。
   * @returns 经过全部管道处理后的最终值。
   */
  public async apply<TInput = unknown>(
    value: TInput,
    { metatype, type, data }: ArgumentMetadata,
    pipes: PipeTransform[],
  ) {
    const token = this.paramsTokenFactory.exchangeEnumForString(
      type as any as RouteParamtypes,
    );
    return this.applyPipes(value, { metatype, type: token, data }, pipes);
  }

  /**
   * 依次执行管道：通过 reduce 构成异步链，前一个管道的输出作为
   * 下一个管道的输入，最后一个管道的返回值即参数的最终值。
   *
   * @param value - 当前参数的原始值。
   * @param metadata - 参数元数据（metatype、type、data）。
   * @param transforms - 管道实例数组（按声明顺序执行）。
   * @returns 管道链处理后的最终值（Promise 包装）。
   */
  public async applyPipes<TInput = unknown>(
    value: TInput,
    { metatype, type, data }: { metatype: any; type?: any; data?: any },
    transforms: PipeTransform[],
  ) {
    return transforms.reduce(async (deferredValue, pipe) => {
      const val = await deferredValue;
      const result = pipe.transform(val, { metatype, type, data });
      return result;
    }, Promise.resolve(value));
  }
}
