import { expect } from 'chai';
import { Module } from '../../decorators/modules/module.decorator';

/**
 * @Module 装饰器的单元测试：
 * 验证它把 providers/imports/exports/controllers 写入模块元数据，
 * 并对未知的属性键抛出异常。
 */
describe('@Module', () => {
  const moduleProps = {
    providers: ['Test'],
    imports: ['Test'],
    exports: ['Test'],
    controllers: ['Test'],
  };

  @Module(moduleProps as any)
  class TestModule {}

  it('should enhance class with expected module metadata', () => {
    const imports = Reflect.getMetadata('imports', TestModule);
    const providers = Reflect.getMetadata('providers', TestModule);
    const exports = Reflect.getMetadata('exports', TestModule);
    const controllers = Reflect.getMetadata('controllers', TestModule);

    expect(imports).to.be.eql(moduleProps.imports);
    expect(providers).to.be.eql(moduleProps.providers);
    expect(controllers).to.be.eql(moduleProps.controllers);
    expect(exports).to.be.eql(moduleProps.exports);
  });

  it('should throw exception when module properties are invalid', () => {
    const invalidProps = {
      ...moduleProps,
      test: [],
    };

    expect(Module.bind(null, invalidProps)).to.throw(Error);
  });
});
