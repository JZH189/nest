import { expect } from 'chai';
import { MqttContext } from '../../ctx-host';

// MqttContext 单元测试：验证 MQTT 上下文中消息与包（packet）的访问。
describe('MqttContext', () => {
  const args = ['test', { test: true }];
  let context: MqttContext;

  beforeEach(() => {
    context = new MqttContext(args as [string, Record<string, any>]);
  });
  describe('getTopic', () => {
    it('should return topic', () => {
      expect(context.getTopic()).to.be.eql(args[0]);
    });
  });
  describe('getPacket', () => {
    it('should return packet', () => {
      expect(context.getPacket()).to.be.eql(args[1]);
    });
  });
});
