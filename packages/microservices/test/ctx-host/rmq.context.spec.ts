import { expect } from 'chai';
import { RmqContext } from '../../ctx-host';

// RmqContext 单元测试：验证 RabbitMQ 上下文中消息、原始消息与模式的访问。
describe('RmqContext', () => {
  const args = [{ test: true }, 'test', 'pattern'];
  let context: RmqContext;

  beforeEach(() => {
    context = new RmqContext(args as [Record<string, any>, any, string]);
  });
  describe('getMessage', () => {
    it('should return original message', () => {
      expect(context.getMessage()).to.be.eql(args[0]);
    });
  });
  describe('getChannelRef', () => {
    it('should return channel reference', () => {
      expect(context.getChannelRef()).to.be.eql(args[1]);
    });
  });
  describe('getPattern', () => {
    it('should return pattern', () => {
      expect(context.getPattern()).to.be.eql(args[2]);
    });
  });
});
