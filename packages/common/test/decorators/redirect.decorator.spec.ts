import { expect } from 'chai';
import { REDIRECT_METADATA } from '../../constants';
import { Redirect } from '../../decorators/http/redirect.decorator';
import { HttpStatus } from '../../index';

/**
 * @Redirect 装饰器的单元测试：
 * 验证它在方法上写入重定向 URL 和响应状态码元数据。
 */
describe('@Redirect', () => {
  const url = 'http://test.com';
  const statusCode = HttpStatus.FOUND;

  class Test {
    @Redirect(url, statusCode)
    public static test() {}
  }

  it('should enhance method with expected redirect url string', () => {
    const metadata = Reflect.getMetadata(REDIRECT_METADATA, Test.test);
    expect(metadata.url).to.be.eql(url);
  });

  it('should enhance method with expected response code', () => {
    const metadata = Reflect.getMetadata(REDIRECT_METADATA, Test.test);
    expect(metadata.statusCode).to.be.eql(statusCode);
  });
});
