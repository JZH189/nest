import { expect } from 'chai';
import { randomStringGenerator } from '../../utils/random-string-generator.util';

/**
 * randomStringGenerator 工具函数的单元测试：
 * 验证它能生成随机字符串（用于生成请求 ID 等）。
 */
describe('randomStringGenerator', () => {
  it('should generate random string', () => {
    expect(randomStringGenerator()).to.be.a('string');
  });
});
