import { expect } from 'chai';
import { HttpCode } from '../../decorators/http/http-code.decorator';
import { HTTP_CODE_METADATA } from '../../constants';

/**
 * @HttpCode 装饰器的单元测试：
 * 验证它在方法上写入自定义 HTTP 状态码元数据。
 */
describe('@HttpCode', () => {
  const httpCode = 200;
  class Test {
    @HttpCode(httpCode)
    public static test() {}
  }

  it('should enhance method with expected http status code', () => {
    const metadata = Reflect.getMetadata(HTTP_CODE_METADATA, Test.test);
    expect(metadata).to.be.eql(httpCode);
  });
});
