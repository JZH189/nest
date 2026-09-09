import { expect } from 'chai';
import { Provider } from '../../../interfaces';
import { getInjectionProviders } from '../../../module-utils/utils/get-injection-providers.util';

/**
 * getInjectionProviders 工具函数的单元测试：
 * 验证它能从 providers 列表中筛选出被指定 provider（按 inject 依赖）实际需要的那些。
 */
describe('getInjectionProviders', () => {
  // 构造 8 个 provider，其中仅部分被 provider 'e'（及其依赖）引用；
  // 类 C/G/H 通过静态属性声明 token 与 optional 标记
  it('should take only required providers', () => {
    class C {
      static token = 'anything';
    }
    class G {
      static token = 'anything';
      static optional = true;
    }
    class H {
      static token = 'anything';
      static optional = false;
    }
    const providers: Provider[] = [
      {
        //0
        provide: 'a',
        useValue: 'a',
      },
      {
        //1
        provide: 'b',
        useValue: 'b',
      },
      C, //2
      {
        //3
        provide: 'd',
        useFactory: (c, b) => [c, b],
        inject: [
          C,
          {
            token: 'b',
            optional: true,
          },
          'x',
          G,
          H,
        ],
      },
      {
        //4
        provide: 'e',
        useFactory: (d, b) => [d, b],
        inject: ['d', 'b'],
      },
      {
        //5
        provide: 'f',
        useValue: 'f',
      },
      G, //6
      H, //7
    ];

    const expected = [
      providers[1],
      providers[2],
      providers[3],
      providers[4],
      providers[6],
      providers[7],
    ];

    const result = getInjectionProviders(providers, ['e']);

    expect(result).to.have.members(expected);
  });
});
