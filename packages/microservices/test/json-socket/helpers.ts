import {
  AddressInfo,
  createServer as netCreateServer,
  Server,
  Socket,
} from 'net';
import { TcpEventsMap } from '../../events/tcp.events';
import { JsonSocket } from '../../helpers/json-socket';

export const ip = '127.0.0.1';

/**
 * 创建一个监听随机端口的 net 服务器，成功后通过回调返回。
 */
export function createServer(callback: (err?: any, server?: Server) => void) {
  const server = netCreateServer();
  server.listen();

  server.on('listening', () => {
    callback(null, server);
  });

  server.on(TcpEventsMap.ERROR, (err: any) => {
    callback(err);
  });
}

/**
 * 连接到指定服务器，返回包装为 JsonSocket 的客户端与服务器端套接字。
 */
export function createClient(
  server: Server,
  callback: (
    err?: any,
    clientSocket?: JsonSocket,
    serverSocket?: JsonSocket,
  ) => void,
) {
  const clientSocket = new JsonSocket(new Socket());

  const address = server.address();
  if (!address) {
    throw new Error('server.address() returned null');
  }
  const port = (address as AddressInfo).port;

  clientSocket.connect(port, ip);

  clientSocket.on(TcpEventsMap.ERROR, (err: any) => {
    callback(err);
  });

  server.once('connection', socket => {
    const serverSocket = new JsonSocket(socket);
    callback(null, clientSocket, serverSocket);
  });
}

/**
 * 一次性创建服务器与客户端，并在两端套接字就绪后回调。
 */
export function createServerAndClient(
  callback: (
    err?: any,
    server?: Server,
    clientSocket?: JsonSocket,
    serverSocket?: JsonSocket,
  ) => void,
) {
  createServer((serverErr, server) => {
    if (serverErr) {
      return callback(serverErr);
    }

    createClient(server!, (clientErr, clientSocket, serverSocket) => {
      if (clientErr) {
        return callback(clientErr);
      }

      callback(null, server, clientSocket, serverSocket);
    });
  });
}

/**
 * 生成 [start, end] 闭区间的连续整数数组。
 */
export function range(start: number, end: number) {
  const r = [] as number[];
  for (let i = start; i <= end; i++) {
    r.push(i);
  }
  return r;
}
