/**
 * HTTP 标准状态码枚举。
 *
 * 在 Nest 中与 `@HttpCode()`、`@Redirect()`、`HttpException` 及其子类
 * （如 `new NotFoundException()` 默认 404）配合使用，
 * 用于定义路由处理程序的响应状态码。
 *
 * 示例: `@HttpCode(HttpStatus.CREATED)`
 *
 * @publicApi
 */
export enum HttpStatus {
  // 1xx：信息性状态码
  CONTINUE = 100, // 继续
  SWITCHING_PROTOCOLS = 101, // 切换协议
  PROCESSING = 102, // 处理中（WebDAV）
  EARLYHINTS = 103, // 早期提示
  // 2xx：成功状态码
  OK = 200, // 请求成功（Nest 默认响应码）
  CREATED = 201, // 创建成功
  ACCEPTED = 202, // 已接受
  NON_AUTHORITATIVE_INFORMATION = 203, // 非权威信息
  NO_CONTENT = 204, // 无内容
  RESET_CONTENT = 205, // 重置内容
  PARTIAL_CONTENT = 206, // 部分内容
  MULTI_STATUS = 207, // 多状态（WebDAV）
  ALREADY_REPORTED = 208, // 已报告（WebDAV）
  CONTENT_DIFFERENT = 210, // 内容不同
  // 3xx：重定向状态码
  AMBIGUOUS = 300, // 多种选择
  MOVED_PERMANENTLY = 301, // 永久移动
  FOUND = 302, // 临时移动
  SEE_OTHER = 303, // 参见其他
  NOT_MODIFIED = 304, // 未修改
  TEMPORARY_REDIRECT = 307, // 临时重定向
  PERMANENT_REDIRECT = 308, // 永久重定向
  // 4xx：客户端错误状态码
  BAD_REQUEST = 400, // 错误的请求
  UNAUTHORIZED = 401, // 未授权
  PAYMENT_REQUIRED = 402, // 需要付费
  FORBIDDEN = 403, // 禁止访问
  NOT_FOUND = 404, // 未找到
  METHOD_NOT_ALLOWED = 405, // 方法不允许
  NOT_ACCEPTABLE = 406, // 无法接受
  PROXY_AUTHENTICATION_REQUIRED = 407, // 需要代理认证
  REQUEST_TIMEOUT = 408, // 请求超时
  CONFLICT = 409, // 冲突
  GONE = 410, // 已删除
  LENGTH_REQUIRED = 411, // 需要内容长度
  PRECONDITION_FAILED = 412, // 前置条件失败
  PAYLOAD_TOO_LARGE = 413, // 请求体过大
  URI_TOO_LONG = 414, // URI 过长
  UNSUPPORTED_MEDIA_TYPE = 415, // 不支持的媒体类型
  REQUESTED_RANGE_NOT_SATISFIABLE = 416, // 请求范围不满足
  EXPECTATION_FAILED = 417, // 期望失败
  I_AM_A_TEAPOT = 418, // 我是一个茶壶（彩蛋）
  MISDIRECTED = 421, // 错误定向
  UNPROCESSABLE_ENTITY = 422, // 不可处理的实体（常用于参数校验失败）
  LOCKED = 423, // 已锁定（WebDAV）
  FAILED_DEPENDENCY = 424, // 依赖失败（WebDAV）
  PRECONDITION_REQUIRED = 428, // 需要前置条件
  TOO_MANY_REQUESTS = 429, // 请求过多（限流）
  UNRECOVERABLE_ERROR = 456, // 不可恢复的错误
  // 5xx：服务端错误状态码
  INTERNAL_SERVER_ERROR = 500, // 服务器内部错误
  NOT_IMPLEMENTED = 501, // 未实现
  BAD_GATEWAY = 502, // 网关错误
  SERVICE_UNAVAILABLE = 503, // 服务不可用
  GATEWAY_TIMEOUT = 504, // 网关超时
  HTTP_VERSION_NOT_SUPPORTED = 505, // 不支持的 HTTP 版本
  INSUFFICIENT_STORAGE = 507, // 存储不足（WebDAV）
  LOOP_DETECTED = 508, // 检测到循环（WebDAV）
}
