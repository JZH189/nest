/**
 * 路由参数的来源类型。管道（Pipe）的 `ArgumentMetadata.type` 即为该值，
 * 用于告知管道当前处理的参数来自请求的哪个部分。
 *
 * @publicApi
 */
export type Paramtype = 'body' | 'query' | 'param' | 'custom';
