/**
 * gRPC 通道（Channel）初始化时使用的选项接口（第三方 @grpc/grpc-js 的类型声明镜像）。
 * 此列表并不完整，完整参考：https://grpc.github.io/grpc/core/group__grpc__arg__keys.html
 *
 * 常用字段说明：
 * - 'grpc.max_send_message_length' / 'grpc.max_receive_message_length'：
 *   单条消息的最大发送/接收字节数（默认约 4MB，超出时报错）；
 * - 'grpc.max_metadata_size'：元数据的最大字节数；
 * - 'grpc.max_concurrent_streams'：单连接上的最大并发流数；
 * - 其余键为 gRPC 内核的重连、代理、TLS 覆盖等高级参数。
 *
 * @publicApi
 */
export interface ChannelOptions {
  'grpc.max_send_message_length'?: number;
  'grpc.max_receive_message_length'?: number;
  'grpc.max_metadata_size'?: number;
  'grpc.ssl_target_name_override'?: string;
  'grpc.primary_user_agent'?: string;
  'grpc.secondary_user_agent'?: string;
  'grpc.default_authority'?: string;
  'grpc.service_config'?: string;
  'grpc.max_concurrent_streams'?: number;
  'grpc.initial_reconnect_backoff_ms'?: number;
  'grpc.max_reconnect_backoff_ms'?: number;
  'grpc.use_local_subchannel_pool'?: number;
  'grpc-node.max_session_memory'?: number;
  [key: string]: any;
}
