import { expect } from 'chai';
import { GLOBAL_MODULE_METADATA } from '../../constants';
import { Global } from '../../index';

/**
 * @Global 装饰器的单元测试：
 * 验证它将模块标记为全局模块（写入 GlobalModule 元数据）。
 */
describe('@Global', () => {
  @Global()
  class Test {}

  it('should enrich metatype with GlobalModule metadata', () => {
    const isGlobal = Reflect.getMetadata(GLOBAL_MODULE_METADATA, Test);
    expect(isGlobal).to.be.true;
  });
});
