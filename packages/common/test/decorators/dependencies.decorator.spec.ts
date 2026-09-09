import { expect } from 'chai';
import { Dependencies } from '../../decorators/core/dependencies.decorator';
import { PARAMTYPES_METADATA } from '../../constants';

/**
 * @Dependencies 装饰器的单元测试：
 * 验证它为类写入依赖（构造参数类型）元数据，并支持数组和散列参数两种传参方式。
 */
describe('@Dependencies', () => {
  const dep = 'test',
    dep2 = 'test2';
  const deps = [dep, dep2];

  @Dependencies(deps)
  class Test {}
  @Dependencies(dep, dep2)
  class Test2 {}

  it('should enhance class with expected dependencies array', () => {
    const metadata = Reflect.getMetadata(PARAMTYPES_METADATA, Test);
    expect(metadata).to.be.eql(deps);
  });

  it('should makes passed array flatten', () => {
    const metadata = Reflect.getMetadata(PARAMTYPES_METADATA, Test2);
    expect(metadata).to.be.eql([dep, dep2]);
  });
});
