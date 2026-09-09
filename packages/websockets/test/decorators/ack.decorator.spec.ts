import 'reflect-metadata';
import { expect } from 'chai';
import { PARAM_ARGS_METADATA } from '../../constants';
import { Ack } from '../../decorators/ack.decorator';
import { WsParamtype } from '../../enums/ws-paramtype.enum';

class AckTest {
  public test(@Ack() ack: Function) {}
}

/**
 * @Ack 装饰器的单元测试：验证 ACK 参数元数据的写入。
 */
describe('@Ack', () => {
  it('should enhance class with expected request metadata', () => {
    const argsMetadata = Reflect.getMetadata(
      PARAM_ARGS_METADATA,
      AckTest,
      'test',
    );

    const expectedMetadata = {
      [`${WsParamtype.ACK}:0`]: {
        index: 0,
        data: undefined,
        pipes: [],
      },
    };
    expect(argsMetadata).to.be.eql(expectedMetadata);
  });
});
