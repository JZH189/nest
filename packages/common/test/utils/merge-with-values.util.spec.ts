import { expect } from 'chai';
import { MergeWithValues } from '../../utils/merge-with-values.util';

/**
 * MergeWithValues 工具函数的单元测试：
 * 验证它把给定值合并到类原型上，并以"类名 + JSON 值"生成新的类名。
 */
describe('MergeWithValues', () => {
  let type;
  const data = { test: [1, 2, 3] };
  class Test {}

  beforeEach(() => {
    type = MergeWithValues(data)(Test);
  });
  it('should enrich prototype with given values', () => {
    expect(type.prototype).to.contain(data);
  });
  it('should set name of metatype', () => {
    expect(type.name).to.eq(Test.name + JSON.stringify(data));
  });
});
