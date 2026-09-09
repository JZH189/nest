import { expect } from 'chai';
import * as sinon from 'sinon';
import { ResolveReplFn } from '../../../repl/native-functions';
import { ReplContext } from '../../../repl/repl-context';
import { NestContainer } from '../../../injector/container';

// 验证 REPL 内置函数 resolve：按 token 创建请求作用域提供者的新实例
describe('ResolveReplFn', () => {
  let resolveReplFn: ResolveReplFn;

  let replContext: ReplContext;
  let mockApp: {
    container: NestContainer;
    get: sinon.SinonStub;
    resolve: sinon.SinonSpy;
    select: sinon.SinonSpy;
  };

  before(async () => {
    const container = new NestContainer();

    mockApp = {
      container,
      get: sinon.stub(),
      resolve: sinon.spy(),
      select: sinon.spy(),
    };
    replContext = new ReplContext(mockApp as any);
  });

  beforeEach(() => {
    resolveReplFn = replContext.nativeFunctions.get('resolve') as ResolveReplFn;
  });
  afterEach(() => sinon.restore());

  it('the function name should be "resolve"', () => {
    expect(resolveReplFn).to.not.be.undefined;
    expect(resolveReplFn.fnDefinition.name).to.eql('resolve');
  });

  describe('action', () => {
    it('should pass arguments down to the application context', async () => {
      const token = 'test';
      const contextId = {};

      await resolveReplFn.action(token, contextId);
      expect(mockApp.resolve.calledWith(token, contextId)).to.be.true;
    });
  });
});
