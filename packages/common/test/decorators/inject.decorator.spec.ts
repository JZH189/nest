import { expect } from 'chai';
import { SELF_DECLARED_DEPS_METADATA } from '../../constants';
import { Inject } from '../../index';

/**
 * @Inject 装饰器的单元测试：
 * 验证它为构造函数参数写入手动声明的依赖标识（支持字符串和注入 token）。
 */
describe('@Inject', () => {
  const opaqueToken = () => ({});
  class Test {
    constructor(
      @Inject('test') param,
      @Inject('test2') param2,
      @Inject(opaqueToken) param3,
    ) {}
  }

  it('should enhance class with expected constructor params metadata', () => {
    const metadata = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, Test);

    const expectedMetadata = [
      { index: 2, param: opaqueToken },
      { index: 1, param: 'test2' },
      { index: 0, param: 'test' },
    ];
    expect(metadata).to.be.eql(expectedMetadata);
  });
});
