/**
 * 微服务「基础消息模式」：字符串或数字字面量，
 * 如 `{ cmd: 'sum' }` 中的 'sum'。
 */
export type MsFundamentalPattern = string | number;

/**
 * 微服务「对象消息模式」：键到基础模式或嵌套对象模式的映射，
 * 如 `{ cmd: 'sum' }`、`{ role: 'user', cmd: 'create' }`。
 * 对象 pattern 会被归一化为固定键序的路由字符串。
 */
export interface MsObjectPattern {
  [key: string]: MsFundamentalPattern | MsObjectPattern;
}

/**
 * 微服务消息模式的统一类型：对象模式或基础（字面量）模式。
 * @MessagePattern/@EventPattern 装饰器与各传输层均使用该类型。
 */
export type MsPattern = MsObjectPattern | MsFundamentalPattern;
