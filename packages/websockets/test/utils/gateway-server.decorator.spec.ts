import { expect } from 'chai';
import { WebSocketServer } from '../../decorators/gateway-server.decorator';
import { GATEWAY_SERVER_METADATA } from '../../constants';

/**
 * @WebSocketServer 装饰器的单元测试：验证 GATEWAY_SERVER_METADATA 元数据的写入。
 */
describe('@WebSocketServer', () => {
  class TestGateway {
    @WebSocketServer() static server;
  }

  it('should decorate server property with expected metadata', () => {
    const isServer = Reflect.getOwnMetadata(
      GATEWAY_SERVER_METADATA,
      TestGateway,
      'server',
    );
    expect(isServer).to.be.eql(true);
  });
  it('should set property value to null by default', () => {
    expect(TestGateway.server).to.be.eql(null);
  });
});
