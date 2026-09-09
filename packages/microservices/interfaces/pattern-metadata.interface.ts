/**
 * 消息模式的元数据形式：对象 pattern（Record）或字符串 pattern。
 * 与运行时的 MsPattern 对应，用于端点元数据扫描场景。
 */
export type PatternMetadata = Record<string, any> | string;
