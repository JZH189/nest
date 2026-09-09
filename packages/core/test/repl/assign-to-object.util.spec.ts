import { expect } from 'chai';
import { assignToObject } from '../../repl/assign-to-object.util';

// 验证 assignToObject 将源对象的全部可枚举属性及其属性描述符复制到目标对象
describe('assignToObject', () => {
  it('should copy all enumerable properties and their descriptors', () => {
    const sourceObj = {};
    Object.defineProperty(sourceObj, 'foo', {
      value: 123,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    Object.defineProperty(sourceObj, 'bar', {
      value: 456,
      configurable: true,
      enumerable: true,
      writable: false,
    });
    const targetObj = {};

    assignToObject(targetObj, sourceObj);

    expect(Object.getOwnPropertyDescriptor(targetObj, 'foo')).to.be.eql({
      value: 123,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    expect(Object.getOwnPropertyDescriptor(targetObj, 'bar')).to.be.eql({
      value: 456,
      configurable: true,
      enumerable: true,
      writable: false,
    });
  });
});
