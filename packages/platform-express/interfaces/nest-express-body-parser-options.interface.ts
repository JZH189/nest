import type { IncomingMessage } from 'http';

/**
 * Express body 解析器的通用选项接口。
 * 为保持与 @types/body-parser 的类型兼容而定义的类型别名，
 * 可通过索引签名承载各解析器（json/urlencoded/text/raw）特有的额外选项。
 *
 * @see https://github.com/DefinitelyTyped/DefinitelyTyped/blob/dcd1673c4fa18a15ea8cd8ff8af7d563bb6dc8e6/types/body-parser/index.d.ts#L48-L66#L48-L66
 * @publicApi
 */
export interface NestExpressBodyParserOptions {
  /** When set to true, then deflated (compressed) bodies will be inflated; when false, deflated bodies are rejected. Defaults to true. */
  inflate?: boolean | undefined;

  /**
   * Controls the maximum request body size. If this is a number,
   * then the value specifies the number of bytes; if it is a string,
   * the value is passed to the bytes library for parsing. Defaults to '100kb'.
   */
  limit?: number | string | undefined;

  /**
   * The type option is used to determine what media type the middleware will parse
   */
  type?: string | string[] | ((req: IncomingMessage) => any) | undefined;

  // Catch-all for body-parser type specific options
  [key: string]: unknown;
}
