import { expect } from 'chai';
import { PIPES_METADATA } from '../../constants';
import { UsePipes } from '../../decorators/core/use-pipes.decorator';
import { InvalidDecoratorItemException } from '../../utils/validate-each.util';

class Pipe {
  transform() {}
}

/**
 * @UsePipes 装饰器的单元测试：
 * 验证它在类/方法上写入管道元数据，并对非法参数抛出异常。
 */
describe('@UsePipes', () => {
  const pipes = [new Pipe(), new Pipe()];

  @UsePipes(...pipes)
  class Test {}

  class TestWithMethod {
    @UsePipes(...pipes)
    public static test() {}
  }

  it('should enhance class with expected pipes array', () => {
    const metadata = Reflect.getMetadata(PIPES_METADATA, Test);
    expect(metadata).to.be.eql(pipes);
  });

  it('should enhance method with expected pipes array', () => {
    const metadata = Reflect.getMetadata(PIPES_METADATA, TestWithMethod.test);
    expect(metadata).to.be.eql(pipes);
  });

  it('when object is invalid should throw exception', () => {
    try {
      UsePipes('test' as any)(() => {});
    } catch (e) {
      expect(e).to.be.instanceof(InvalidDecoratorItemException);
    }
  });
});
