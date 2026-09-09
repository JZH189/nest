import { expect } from 'chai';
import { Render } from '../../decorators/http/render.decorator';
import { RENDER_METADATA } from '../../constants';

/**
 * @Render 装饰器的单元测试：
 * 验证它在方法上写入模板引擎所需的模板名元数据。
 */
describe('@Render', () => {
  const template = 'template';

  class Test {
    @Render('template')
    public static test() {}
  }

  it('should enhance method with expected template string', () => {
    const metadata = Reflect.getMetadata(RENDER_METADATA, Test.test);
    expect(metadata).to.be.eql(template);
  });
});
