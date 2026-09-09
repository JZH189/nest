/**
 * multer 文件上传的配置选项接口。
 * 既是各拦截器 localOptions 的类型，也是 MulterModule 全局配置的类型，
 * 字段含义与 expressjs/multer 官方选项一致。
 *
 * @see https://github.com/expressjs/multer
 *
 * @publicApi
 */
export interface MulterOptions {
  /** 上传文件的目标目录（DiskStorage 的简写形式）；也可传函数动态决定目录 */
  dest?: string | Function;
  /** The storage engine to use for uploaded files. */
  storage?: any;
  /**
   * An object specifying the size limits of the following optional properties. This object is passed to busboy
   * directly, and the details of properties can be found on https://github.com/mscdex/busboy#busboy-methods
   */
  limits?: {
    /** Max field name size (Default: 100 bytes) */
    fieldNameSize?: number;
    /** Max field value size (Default: 1MB) */
    fieldSize?: number;
    /** Max number of non- file fields (Default: Infinity) */
    fields?: number;
    /** For multipart forms, the max file size (in bytes)(Default: Infinity) */
    fileSize?: number;
    /** For multipart forms, the max number of file fields (Default: Infinity) */
    files?: number;
    /** For multipart forms, the max number of parts (fields + files)(Default: Infinity) */
    parts?: number;
    /** For multipart forms, the max number of header key=> value pairs to parse Default: 2000(same as node's http). */
    headerPairs?: number;
  };

  /** Keep the full path of files instead of just the base name (Default: false) */
  preservePath?: boolean;

  /** Default character set for part header values (e.g. filename) (Default: 'latin1') */
  defParamCharset?: string;

  /** 文件过滤函数：通过 callback(null, true/false) 决定是否接受该文件 */
  fileFilter?(
    req: any,
    file: {
      /** Field name specified in the form */
      fieldname: string;
      /** Name of the file on the user's computer */
      originalname: string;
      /** Encoding type of the file */
      encoding: string;
      /** Mime type of the file */
      mimetype: string;
      /** Size of the file in bytes */
      size: number;
      /** The folder to which the file has been saved (DiskStorage) */
      destination: string;
      /** The name of the file within the destination (DiskStorage) */
      filename: string;
      /** Location of the uploaded file (DiskStorage) */
      path: string;
      /** A Buffer of the entire file (MemoryStorage) */
      buffer: Buffer;
    },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ): void;
}

/**
 * 文件字段描述（配合 FileFieldsInterceptor 使用）。
 *
 * @publicApi
 */
export interface MulterField {
  /** The field name. */
  name: string;
  /** Optional maximum number of files per field to accept. */
  maxCount?: number;
}
