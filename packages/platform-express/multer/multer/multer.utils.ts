import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { multerExceptions, busboyExceptions } from './multer.constants';

// Multer may add in a 'field' property to the error
// https://github.com/expressjs/multer/blob/aa42bea6ac7d0cb8fcb279b15a7278cda805dc63/lib/multer-error.js#L19
/**
 * 把 multer/busboy 抛出的底层上传错误转换为 NestJS 的 HTTP 异常，
 * 便于异常过滤器按 HTTP 语义处理（如文件过大返回 413、字段/文件数量等
 * 问题返回 400）。非上传类错误原样返回，不做转换。
 *
 * @param error - 捕获到的错误对象（可能带有出错的字段名 field）
 * @returns 转换后的 HttpException；无法识别的错误原样返回
 */
export function transformException(
  error: (Error & { field?: string }) | undefined,
) {
  if (!error || error instanceof HttpException) {
    return error;
  }
  switch (error.message) {
    case multerExceptions.LIMIT_FILE_SIZE:
      return new PayloadTooLargeException(error.message);
    case multerExceptions.LIMIT_FILE_COUNT:
    case multerExceptions.LIMIT_FIELD_KEY:
    case multerExceptions.LIMIT_FIELD_VALUE:
    case multerExceptions.LIMIT_FIELD_COUNT:
    case multerExceptions.LIMIT_UNEXPECTED_FILE:
    case multerExceptions.LIMIT_PART_COUNT:
    case multerExceptions.MISSING_FIELD_NAME:
      if (error.field) {
        return new BadRequestException(`${error.message} - ${error.field}`);
      }
      return new BadRequestException(error.message);
    case busboyExceptions.MULTIPART_BOUNDARY_NOT_FOUND:
      return new BadRequestException(error.message);
    case busboyExceptions.MULTIPART_MALFORMED_PART_HEADER:
    case busboyExceptions.MULTIPART_UNEXPECTED_END_OF_FORM:
    case busboyExceptions.MULTIPART_UNEXPECTED_END_OF_FILE:
      return new BadRequestException(`Multipart: ${error.message}`);
  }
  return error;
}
