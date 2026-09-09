import { expect } from 'chai';
import { loadPackage } from '../../utils/load-package.util';

/**
 * loadPackage 工具函数的单元测试：
 * 验证可选依赖包存在时能正常加载（缺失时会抛出带上下文的引导错误）。
 */
describe('loadPackage', () => {
  describe('when package is available', () => {
    it('should return package', () => {
      expect(loadPackage('reflect-metadata', 'ctx')).to.be.eql(
        require('reflect-metadata'),
      );
    });
  });
});
