import { expect } from 'chai';
import { ROUTE_ARGS_METADATA } from '../../constants';
import { Bind } from '../../decorators/core/bind.decorator';
import { Req } from '../../decorators/http/route-params.decorator';

/**
 * @Bind 装饰器的单元测试：
 * 验证它能把参数装饰器（如 @Req）绑定到方法上，并写入路由参数元数据。
 */
describe('@Bind', () => {
  class TestWithMethod {
    @Bind(Req())
    public test() {}
  }

  it('should enhance method - bind each decorator to method', () => {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestWithMethod,
      'test',
    );

    expect(metadata).to.be.deep.equal({
      '0:0': {
        data: undefined,
        index: 0,
        pipes: [],
      },
    });
  });
});
