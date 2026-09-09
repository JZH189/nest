import { expect } from 'chai';
import { IdentitySerializer } from '../../serializers/identity.serializer';

// IdentitySerializer 单元测试：验证恒等序列化器原样返回输入数据。
describe('IdentitySerializer', () => {
  let instance: IdentitySerializer;
  beforeEach(() => {
    instance = new IdentitySerializer();
  });
  describe('serialize', () => {
    it('should return the value unchanged', () => {
      const value = {};
      expect(instance.serialize(value)).to.be.eql(value);
    });
  });
});
