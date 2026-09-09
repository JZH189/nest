import { expect } from 'chai';
import { forwardRef } from '../../utils/forward-ref.util';

/**
 * forwardRef 工具函数的单元测试：
 * 验证它把取值函数包装成可延迟解析的引用（用于解决循环依赖）。
 */
describe('forwardRef', () => {
  it('should return object with forwardRef property', () => {
    const fn = () => ({});
    const referenceFn = forwardRef(() => fn);
    expect(referenceFn.forwardRef()).to.be.eql(fn);
  });
});
