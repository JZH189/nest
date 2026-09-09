import { expect } from 'chai';
import { IdentityDeserializer } from '../../deserializers/identity.deserializer';

// IdentityDeserializer 单元测试：验证恒等反序列化器原样返回输入数据。
describe('IdentityDeserializer', () => {
  let instance: IdentityDeserializer;
  beforeEach(() => {
    instance = new IdentityDeserializer();
  });
  describe('deserialize', () => {
    it('should return the value unchanged', () => {
      const value = {};
      expect(instance.deserialize(value)).to.be.eql(value);
    });
  });
});
