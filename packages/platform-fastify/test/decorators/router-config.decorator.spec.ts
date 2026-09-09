import { expect } from 'chai';
import { FASTIFY_ROUTE_CONFIG_METADATA } from '../../constants';
import { RouteConfig } from '../../decorators/route-config.decorator';

// 验证 @RouteConfig 装饰器将路由配置元数据写入处理方法
describe('@RouteConfig', () => {
  const routeConfig = { testKey: 'testValue' };
  class Test {
    config;
    @RouteConfig(routeConfig)
    public static test() {}
  }

  it('should enhance method with expected fastify route config', () => {
    const path = Reflect.getMetadata(FASTIFY_ROUTE_CONFIG_METADATA, Test.test);
    expect(path).to.be.eql(routeConfig);
  });
});
