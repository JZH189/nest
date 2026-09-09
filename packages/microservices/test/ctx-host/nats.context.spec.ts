import { expect } from 'chai';
import { NatsContext } from '../../ctx-host';

// NatsContext 单元测试：验证 NATS 上下文中消息主题与原始消息的访问。
describe('NatsContext', () => {
  const args: [string, any] = ['test', {}];
  let context: NatsContext;

  beforeEach(() => {
    context = new NatsContext(args);
  });
  describe('getSubject', () => {
    it('should return subject', () => {
      expect(context.getSubject()).to.be.eql(args[0]);
    });
  });
  describe('getHeaders', () => {
    it('should return headers', () => {
      expect(context.getHeaders()).to.be.eql(args[1]);
    });
  });
});
