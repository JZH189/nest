/**
 * Multer 上传错误消息常量表（与 expressjs/multer 源码中的 MulterError 消息一一对应），
 * 用于 transformException 把底层错误映射为 NestJS 的 HTTP 异常。
 */
export const multerExceptions = {
  // from https://github.com/expressjs/multer/blob/master/lib/multer-error.js
  LIMIT_PART_COUNT: 'Too many parts',
  LIMIT_FILE_SIZE: 'File too large',
  LIMIT_FILE_COUNT: 'Too many files',
  LIMIT_FIELD_KEY: 'Field name too long',
  LIMIT_FIELD_VALUE: 'Field value too long',
  LIMIT_FIELD_COUNT: 'Too many fields',
  LIMIT_UNEXPECTED_FILE: 'Unexpected field',
  MISSING_FIELD_NAME: 'Field name missing',
};

/**
 * busboy（multer 底层的 multipart 解析库）解析错误消息常量表，
 * 用于把 multipart 协议层面的错误映射为 NestJS 的 BadRequestException。
 */
export const busboyExceptions = {
  // from https://github.com/mscdex/busboy/blob/master/lib/types/multipart.js
  MULTIPART_BOUNDARY_NOT_FOUND: 'Multipart: Boundary not found',
  MULTIPART_MALFORMED_PART_HEADER: 'Malformed part header',
  MULTIPART_UNEXPECTED_END_OF_FORM: 'Unexpected end of form',
  MULTIPART_UNEXPECTED_END_OF_FILE: 'Unexpected end of file',
};
