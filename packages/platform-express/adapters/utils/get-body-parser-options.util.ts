import type { RawBodyRequest } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';
import type { NestExpressBodyParserOptions } from '../../interfaces';

/**
 * 作为 body 解析器 verify 回调使用的内部函数：
 * 当解析器拿到完整 Buffer 时，把它挂到 req.rawBody 上，
 * 从而实现 rawBody 选项（保留未经解析的原始请求体）。
 *
 * @param req - 原始请求对象（扩展了 rawBody 字段）
 * @param _res - 原始响应对象（未使用）
 * @param buffer - 解析器缓存的原始请求体 Buffer
 * @returns 恒为 true，表示校验通过、继续正常解析
 */
const rawBodyParser = (
  req: RawBodyRequest<IncomingMessage>,
  _res: ServerResponse,
  buffer: Buffer,
) => {
  if (Buffer.isBuffer(buffer)) {
    req.rawBody = buffer;
  }
  return true;
};

/**
 * 计算 Express body 解析器的最终选项。
 * 当需要保留原始请求体（rawBody=true）时，注入 verify 回调把原始 Buffer
 * 保存到 req.rawBody 上；否则原样返回用户传入的选项。
 *
 * @param rawBody - 是否需要暴露原始请求体
 * @param options - 用户传入的解析器选项（不含 verify 字段）
 * @returns 合并 verify 回调后的完整解析器选项
 */
export function getBodyParserOptions<Options = NestExpressBodyParserOptions>(
  rawBody: boolean,
  options?: Omit<Options, 'verify'>,
): Options {
  let parserOptions: Options = (options || {}) as Options;

  if (rawBody === true) {
    parserOptions = {
      ...parserOptions,
      verify: rawBodyParser,
    };
  }

  return parserOptions;
}
