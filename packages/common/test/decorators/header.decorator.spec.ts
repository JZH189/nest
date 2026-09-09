import { expect } from 'chai';
import { Header } from '../../decorators/http';
import { HEADERS_METADATA } from '../../constants';

/**
 * @Header 装饰器的单元测试：
 * 验证它在方法上写入自定义响应头元数据（多个 @Header 叠加时按声明逆序收集）。
 */
describe('@Header', () => {
  class Test {
    @Header('Content-Type', 'Test')
    @Header('Authorization', 'JWT')
    public static test() {}
  }

  it('should enhance method with expected template string', () => {
    const metadata = Reflect.getMetadata(HEADERS_METADATA, Test.test);
    expect(metadata).to.be.eql([
      { name: 'Authorization', value: 'JWT' },
      { name: 'Content-Type', value: 'Test' },
    ]);
  });
});
