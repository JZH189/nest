import { expect } from 'chai';
import { VERSION_METADATA } from '../../constants';
import { Version } from '../../decorators/core/version.decorator';

/**
 * @Version 装饰器的单元测试：
 * 验证它在方法上写入接口版本元数据，数组形式会自动去重。
 */
describe('@Version', () => {
  const version = '1';
  const versions = ['1', '2', '2', '1', '2', '1'];
  const versionsWithoutDuplicates = ['1', '2'];

  class Test {
    @Version(version)
    public static oneVersion() {}

    @Version(versions)
    public static multipleVersions() {}
  }

  it('should enhance method with expected version string', () => {
    const metadata = Reflect.getMetadata(VERSION_METADATA, Test.oneVersion);
    expect(metadata).to.be.eql(version);
  });

  it('should enhance method with expected version array', () => {
    const metadata = Reflect.getMetadata(
      VERSION_METADATA,
      Test.multipleVersions,
    );
    expect(metadata).to.be.eql(versionsWithoutDuplicates);
  });
});
