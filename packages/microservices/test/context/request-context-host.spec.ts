import { expect } from 'chai';
import { RequestContextHost } from '../../context/request-context-host';
import { BaseRpcContext } from '../../ctx-host/base-rpc.context';

// RequestContextHost 单元测试：验证将 RPC 上下文切换为请求上下文的封装逻辑。
describe('RequestContextHost', () => {
  const data = { test: true };
  const pattern = 'test';
  const ctx = new BaseRpcContext([]);

  let ctxHost: RequestContextHost;
  beforeEach(() => {
    ctxHost = new RequestContextHost(pattern, data, ctx);
  });
  describe('getData', () => {
    it('should return "data" property', () => {
      expect(ctxHost.getData()).to.be.eql(data);
    });
  });
  describe('getContext', () => {
    it('should return "context" property', () => {
      expect(ctxHost.getContext()).to.be.eql(ctx);
    });
  });
  describe('getPattern', () => {
    it('should return "pattern" property', () => {
      expect(ctxHost.getPattern()).to.be.eql(pattern);
    });
  });
});
