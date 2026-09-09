import { expect } from 'chai';
import { RedisContext } from '../../ctx-host';

// RedisContext 单元测试：验证 Redis 上下文中原始消息的访问。
describe('RedisContext', () => {
  const args = ['test'];
  let context: RedisContext;

  beforeEach(() => {
    context = new RedisContext(args as [string]);
  });
  describe('getChannel', () => {
    it('should return original channel', () => {
      expect(context.getChannel()).to.be.eql(args[0]);
    });
  });
});
