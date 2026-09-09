import { expect } from 'chai';
import { GUARDS_METADATA } from '../../constants';
import { UseGuards } from '../../decorators/core/use-guards.decorator';
import { InvalidDecoratorItemException } from '../../utils/validate-each.util';

class Guard {}

/**
 * @UseGuards 装饰器的单元测试：
 * 验证它在类/方法上写入守卫元数据、多次叠加时合并数组，并对非法参数抛出异常。
 */
describe('@UseGuards', () => {
  const guards = [Guard, Guard];

  @UseGuards(...guards)
  class Test {}

  class TestWithMethod {
    @UseGuards(...guards)
    public static test() {}
  }

  class Test2 {
    @UseGuards(...guards)
    @UseGuards(...guards)
    public static test() {}
  }

  it('should enhance class with expected guards array', () => {
    const metadata = Reflect.getMetadata(GUARDS_METADATA, Test);
    expect(metadata).to.be.eql(guards);
  });

  it('should enhance method with expected guards array', () => {
    const metadata = Reflect.getMetadata(GUARDS_METADATA, TestWithMethod.test);
    expect(metadata).to.be.eql(guards);
  });

  it('should enhance method with multiple guards array', () => {
    const metadata = Reflect.getMetadata(GUARDS_METADATA, Test2.test);
    expect(metadata).to.be.eql(guards.concat(guards));
  });

  it('should throw exception when object is invalid', () => {
    try {
      UseGuards('test' as any)(() => {});
    } catch (e) {
      expect(e).to.be.instanceof(InvalidDecoratorItemException);
    }
  });
});
