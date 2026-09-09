import { expect } from 'chai';
import { ClientsContainer } from '../container';

// ClientsContainer 单元测试：验证客户端实例的注册、获取与替换逻辑。
describe('ClientsContainer', () => {
  let instance: ClientsContainer;
  beforeEach(() => {
    instance = new ClientsContainer();
  });
  describe('getAllClients', () => {
    it('should return array of clients', () => {
      const clients = [1, 2, 3];
      (instance as any).clients = clients;
      expect(instance.getAllClients()).to.be.eql(clients);
    });
  });
  describe('addClient', () => {
    it('should push client into clients array', () => {
      const client = 'test';
      instance.addClient(client as any);
      expect(instance.getAllClients()).to.be.deep.equal([client]);
    });
  });
  describe('clear', () => {
    it('should remove all clients', () => {
      const clients = [1, 2, 3];
      (instance as any).clients = clients;
      instance.clear();
      expect(instance.getAllClients()).to.be.deep.equal([]);
    });
  });
});
