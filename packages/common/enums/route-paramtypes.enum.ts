/**
 * 内置路由参数类型枚举。
 *
 * `@Request()`、`@Body()`、`@Query()`、`@Param()` 等参数装饰器会将其
 * 作为 `ROUTE_ARGS_METADATA` 元数据键的一部分（格式 `"{paramtype}:{index}"`），
 * 运行时由各平台的 ParamsTokenFactory / ParamsProducer 据此
 * 从请求对象中解析出对应部分的值注入方法参数。
 *
 * 注意成员值为从 0 开始的序号。
 */
export enum RouteParamtypes {
  REQUEST = 0, // 底层平台的请求对象（@Request()）
  RESPONSE = 1, // 底层平台的响应对象（@Response()）
  NEXT = 2, // Next 中间件函数（@Next()）
  BODY = 3, // 请求体（@Body()）
  QUERY = 4, // URL 查询参数（@Query()）
  PARAM = 5, // 路由路径参数（@Param()）
  HEADERS = 6, // 请求头（@Headers()）
  SESSION = 7, // 会话对象（@Session()）
  FILE = 8, // 上传的单个文件（@UploadedFile()）
  FILES = 9, // 上传的多个文件（@UploadedFiles()）
  HOST = 10, // 请求主机参数（@HostParam()）
  IP = 11, // 客户端 IP 地址（@Ip()）
  RAW_BODY = 12, // 原始请求体 Buffer（@RawBody()）
  ACK = 13, // 微服务/Ws 的消息确认函数（@Ack()）
}
