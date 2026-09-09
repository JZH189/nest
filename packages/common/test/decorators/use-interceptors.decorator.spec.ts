import { expect } from 'chai';
import { INTERCEPTORS_METADATA } from '../../constants';
import { UseInterceptors } from '../../decorators/core/use-interceptors.decorator';
import { InvalidDecoratorItemException } from '../../utils/validate-each.util';

class Interceptor {}

/**
 * @UseInterceptors 装饰器的单元测试：
 * 验证它在类/方法上写入拦截器元数据，并按是否实现 intercept 接口校验参数合法性。
 */
describe('@UseInterceptors', () => {
  const interceptors = [Interceptor, Interceptor];

  @UseInterceptors(...interceptors)
  class Test {}

  class TestWithMethod {
    @UseInterceptors(...interceptors)
    public static test() {}
  }

  it('should enhance class with expected interceptors array', () => {
    const metadata = Reflect.getMetadata(INTERCEPTORS_METADATA, Test);
    expect(metadata).to.be.eql(interceptors);
  });

  it('should enhance method with expected interceptors array', () => {
    const metadata = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      TestWithMethod.test,
    );
    expect(metadata).to.be.eql(interceptors);
  });

  it('when object is invalid should throw exception', () => {
    let error = undefined;
    try {
      UseInterceptors('test' as any)({ name: 'target' } as any);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceof(InvalidDecoratorItemException);
  });

  it('when object is valid should not throw exception', () => {
    let error = undefined;
    try {
      UseInterceptors({
        intercept() {
          return null!;
        },
      })({ name: 'target' } as any);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.undefined;
  });
});
