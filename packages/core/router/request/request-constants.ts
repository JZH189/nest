/**
 * 请求级注入令牌：与 @Inject(REQUEST) 配合使用，可在请求作用域（Scope.REQUEST）
 * 的提供者中注入当前 HTTP 请求对象。
 */
export const REQUEST = 'REQUEST';
/**
 * 请求上下文 ID 的注入令牌（Symbol），用于在请求作用域的实例包装器上
 * 标识和查找当前请求对应的上下文（ContextId）。
 */
export const REQUEST_CONTEXT_ID = Symbol('REQUEST_CONTEXT_ID');
