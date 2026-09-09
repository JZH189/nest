import { expect } from 'chai';
import { TcpEventsMap } from '../../events/tcp.events';
import { JsonSocket } from '../../helpers/json-socket';
import * as helpers from './helpers';

const MESSAGE_EVENT = 'message';

// JsonSocket 事件链式调用测试：验证事件订阅方法返回实例本身，支持链式注册。
describe('JsonSocket chaining', () => {
  it('should return the instance when subscribing to event', done => {
    helpers.createServerAndClient((err, server, clientSocket, serverSocket) => {
      if (err) {
        return done(err);
      }

      expect(clientSocket!.on(MESSAGE_EVENT, () => {})).to.be.instanceof(
        JsonSocket,
      );
      expect(clientSocket!.on(TcpEventsMap.CONNECT, () => {})).to.deep.equal(
        clientSocket,
      );
      expect(
        clientSocket!.on(MESSAGE_EVENT, () => {}).on('end', () => {}),
      ).to.deep.equal(clientSocket);

      clientSocket!.end();
      server!.close(done);
    });
  });
});
