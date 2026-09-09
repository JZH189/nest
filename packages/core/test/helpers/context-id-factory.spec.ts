import { expect } from 'chai';
import { createContextId } from '../../helpers/context-id-factory';

// 验证 createContextId 生成带随机 id 的请求上下文标识
describe('createContextId', () => {
  it('should return an object with random "id" property', () => {
    expect(createContextId()).to.have.property('id');
  });
});
