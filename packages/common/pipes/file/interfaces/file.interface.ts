/**
 * 描述上传文件的最小结构：MIME 类型、文件大小，
 * 以及可选的文件内容缓冲区（内存存储时才存在）
 */
export interface IFile {
  /** 文件的 MIME 类型（由客户端提供） */
  mimetype: string;
  /** 文件大小（字节） */
  size: number;
  /** 文件内容的 Buffer（使用内存存储引擎时存在） */
  buffer?: Buffer;
}
