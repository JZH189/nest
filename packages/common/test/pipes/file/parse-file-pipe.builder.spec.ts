import { expect } from 'chai';
import {
  FileValidator,
  MaxFileSizeValidator,
  ParseFilePipeBuilder,
  FileTypeValidator,
} from '../../../pipes';

/**
 * ParseFilePipeBuilder 的单元测试：
 * 验证链式添加各种文件校验器（大小、类型、自定义）后 build 出的管道
 * 收集了正确的校验器，且多次 build 不会复用旧校验器。
 */
describe('ParseFilePipeBuilder', () => {
  let parseFilePipeBuilder: ParseFilePipeBuilder;

  beforeEach(() => {
    parseFilePipeBuilder = new ParseFilePipeBuilder();
  });

  describe('build', () => {
    describe('when no validator was passed', () => {
      it('should return a ParseFilePipe with no validators', () => {
        const parseFilePipe = parseFilePipeBuilder.build();
        expect(parseFilePipe.getValidators()).to.be.empty;
      });
    });

    describe('when addMaxSizeValidator was chained', () => {
      it('should return a ParseFilePipe with MaxSizeValidator and given options', () => {
        const options = {
          maxSize: 1000,
        };
        const parseFilePipe = parseFilePipeBuilder
          .addMaxSizeValidator(options)
          .build();

        expect(parseFilePipe.getValidators()).to.deep.include(
          new MaxFileSizeValidator(options),
        );
      });
    });

    describe('when addFileTypeValidator was chained', () => {
      it('should return a ParseFilePipe with FileTypeValidator and given options', () => {
        const options = {
          fileType: 'image/jpeg',
        };
        const parseFilePipe = parseFilePipeBuilder
          .addFileTypeValidator(options)
          .build();

        expect(parseFilePipe.getValidators()).to.deep.include(
          new FileTypeValidator(options),
        );
      });
    });

    describe('when custom validator was chained', () => {
      it('should return a ParseFilePipe with TestFileValidator and given options', () => {
        class TestFileValidator extends FileValidator<{ name: string }> {
          buildErrorMessage(file: any): string {
            return 'TestFileValidator failed';
          }

          isValid(file: any): boolean | Promise<boolean> {
            return true;
          }
        }

        const options = {
          name: 'test',
        };

        const parseFilePipe = parseFilePipeBuilder
          .addValidator(new TestFileValidator(options))
          .build();

        expect(parseFilePipe.getValidators()).to.deep.include(
          new TestFileValidator(options),
        );
      });
    });

    describe('when it is called twice with different validators', () => {
      it('should not reuse validators', () => {
        const maxSizeValidatorOptions = {
          maxSize: 1000,
        };

        const pipeWithMaxSizeValidator = parseFilePipeBuilder
          .addMaxSizeValidator(maxSizeValidatorOptions)
          .build();

        const fileTypeValidatorOptions = {
          fileType: 'image/jpeg',
        };

        const pipeWithFileTypeValidator = parseFilePipeBuilder
          .addFileTypeValidator(fileTypeValidatorOptions)
          .build();

        expect(pipeWithFileTypeValidator.getValidators()).not.to.deep.equal(
          pipeWithMaxSizeValidator.getValidators(),
        );
      });
    });
  });
});
