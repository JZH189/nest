import { expect } from 'chai';
import { PARAM_ARGS_METADATA } from '../../constants';
import { Ctx } from '../../decorators';
import { RpcParamtype } from '../../enums/rpc-paramtype.enum';

class CtxTest {
  public test(@Ctx() ctx: any) {}
}

// @Ctx 参数装饰器单元测试：验证将 RPC 上下文注入为方法参数的元数据注册。
describe('@Ctx', () => {
  it('should enhance class with expected request metadata', () => {
    const argsMetadata = Reflect.getMetadata(
      PARAM_ARGS_METADATA,
      CtxTest,
      'test',
    );
    const expectedMetadata = {
      [`${RpcParamtype.CONTEXT}:0`]: {
        data: undefined,
        index: 0,
        pipes: [],
      },
    };
    expect(argsMetadata).to.be.eql(expectedMetadata);
  });
});
