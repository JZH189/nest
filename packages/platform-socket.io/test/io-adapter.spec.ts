import { expect } from 'chai';
import * as sinon from 'sinon';
import { IoAdapter } from '../adapters/io-adapter';
import { of } from 'rxjs';

/**
 * IoAdapter 的单元测试：
 * 验证 bindMessageHandlers 对同一个 socket 多次调用时（模拟多个网关
 * 共享同一连接），disconnect 监听器只注册一次（由 disconnectMap 缓存保证），
 * 而消息事件监听器则按调用次数正常重复注册。
 */
describe('IoAdapter', () => {
  let adapter: IoAdapter;

  beforeEach(() => {
    adapter = new IoAdapter();
  });

  describe('bindMessageHandlers', () => {
    it('should register only one disconnect listener regardless of call count', () => {
      const addListenerSpy = sinon.spy();
      const fakeSocket = {
        on: addListenerSpy,
        off: sinon.stub(),
        addListener: addListenerSpy,
        removeListener: sinon.stub(),
      } as any;

      const handler = {
        message: 'test-event',
        methodName: 'handleTestEvent',
        callback: sinon.stub().returns({ data: 'response' }),
        isAckHandledManually: false,
      };

      const transform = (data: any) => of(data);

      // Call bindMessageHandlers twice on the same socket
      // (simulates two gateways sharing the same socket)
      adapter.bindMessageHandlers(fakeSocket, [handler], transform);
      adapter.bindMessageHandlers(fakeSocket, [handler], transform);

      const disconnectCalls = addListenerSpy
        .getCalls()
        .filter(call => call.args[0] === 'disconnect');

      expect(disconnectCalls).to.have.lengthOf(1);

      // message handlers should still be registered per call
      const messageCalls = addListenerSpy
        .getCalls()
        .filter(call => call.args[0] === 'test-event');
      expect(messageCalls).to.have.lengthOf(2);
    });
  });
});
