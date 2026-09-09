import { ValidationPipe } from '@nestjs/common';
import { expect } from 'chai';
import { PARAM_ARGS_METADATA } from '../../constants';
import { MessageBody } from '../../decorators';
import { WsParamtype } from '../../enums/ws-paramtype.enum';

class MessagePayloadTest {
  public test(@MessageBody(ValidationPipe) payload: any) {}
}

/**
 * @MessageBody 装饰器的单元测试：验证消息负载参数元数据（含管道）的写入。
 */
describe('@MessagePayload', () => {
  it('should enhance class with expected request metadata', () => {
    const argsMetadata = Reflect.getMetadata(
      PARAM_ARGS_METADATA,
      MessagePayloadTest,
      'test',
    );
    const expectedMetadata = {
      [`${WsParamtype.PAYLOAD}:0`]: {
        data: undefined,
        index: 0,
        pipes: [ValidationPipe],
      },
    };
    expect(argsMetadata).to.be.eql(expectedMetadata);
  });
});
