import 'mocha';
import { expect } from 'chai';
import {
  CLIENT_METADATA,
  CLIENT_CONFIGURATION_METADATA,
} from '../../constants';
import { Client } from '../../decorators/client.decorator';

// @Client 属性装饰器单元测试：验证将客户端配置与实例元数据注入到类属性上。
describe('@Client', () => {
  const pattern = { role: 'test' };
  class TestComponent {
    @Client(pattern as any)
    public static instance;
  }
  it(`should enhance property with metadata`, () => {
    const isClient = Reflect.getOwnMetadata(
      CLIENT_METADATA,
      TestComponent,
      'instance',
    );
    const config = Reflect.getOwnMetadata(
      CLIENT_CONFIGURATION_METADATA,
      TestComponent,
      'instance',
    );

    expect(isClient).to.be.true;
    expect(config).to.be.eql(pattern);
  });
});
