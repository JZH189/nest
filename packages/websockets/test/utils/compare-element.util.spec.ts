import { expect } from 'chai';
import { compareElementAt } from '../../utils/compare-element.util';

/**
 * compareElementAt 工具函数的单元测试：验证数组指定位置元素的比较。
 */
describe('compareElementAt', () => {
  it('should compare elements at the specific position in arrays', () => {
    expect(compareElementAt([0, 1, 0], [2, 1, 7], 1)).to.be.true;
    expect(compareElementAt([0, 1, 0], [2, 0, 7], 1)).to.be.false;
  });
});
