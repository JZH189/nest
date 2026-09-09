/**
 * WebSocket 响应接口：处理方法返回值的标准形状。
 * Nest 会把返回值通过 event 字段指定的事件名 emit 给客户端。
 *
 * @typeParam T - 响应数据类型。
 * @publicApi
 */
export interface WsResponse<T = any> {
  event: string;
  data: T;
}
