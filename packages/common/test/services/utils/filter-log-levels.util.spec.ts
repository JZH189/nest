import { expect } from 'chai';
import { filterLogLevels } from '../../../services/utils/filter-log-levels.util';

/**
 * filterLogLevels 工具函数的单元测试：
 * 验证对 ">warn"、">=warn"、逗号分隔列表、单一级别等字符串的解析。
 */
describe('filterLogLevels', () => {
  it('should correctly parse an exclusive range', () => {
    const returned = filterLogLevels('>warn');
    expect(returned).to.deep.equal(['error', 'fatal']);
  });

  it('should correctly parse an inclusive range', () => {
    const returned = filterLogLevels('>=warn');
    expect(returned).to.deep.equal(['warn', 'error', 'fatal']);
  });

  it('should correctly parse a string list', () => {
    const returned = filterLogLevels('verbose,warn,fatal');
    expect(returned).to.deep.equal(['verbose', 'warn', 'fatal']);
  });

  it('should correctly parse a single log level', () => {
    const returned = filterLogLevels('debug');
    expect(returned).to.deep.equal(['debug']);
  });

  it('should return all otherwise', () => {
    const returned = filterLogLevels();
    expect(returned).to.deep.equal([
      'verbose',
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ]);
  });
});
