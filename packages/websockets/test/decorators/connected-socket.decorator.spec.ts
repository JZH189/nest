import { expect } from 'chai';
import { PARAM_ARGS_METADATA } from '../../constants';
import { ConnectedSocket } from '../../decorators';
import { WsParamtype } from '../../enums/ws-paramtype.enum';

class ConnectedSocketTest {
  public test(@ConnectedSocket() socket: any) {}
}

/**
 * @ConnectedSocket 装饰器的单元测试：验证 SOCKET 参数元数据的写入。
 */
describe('@ConnectedSocket', () => {
  it('should enhance class with expected request metadata', () => {
    const argsMetadata = Reflect.getMetadata(
      PARAM_ARGS_METADATA,
      ConnectedSocketTest,
      'test',
    );
    const expectedMetadata = {
      [`${WsParamtype.SOCKET}:0`]: {
        data: undefined,
        index: 0,
        pipes: [],
      },
    };
    expect(argsMetadata).to.be.eql(expectedMetadata);
  });
});
