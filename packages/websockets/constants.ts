import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

/**
 * WebSocket 消息映射元数据的键：用于标记网关类上 "消息 -> 处理方法" 的映射信息。
 */
export const MESSAGE_MAPPING_METADATA = 'websockets:message_mapping';
/**
 * 单条消息的元数据键：由 @SubscribeMessage 写入，表示订阅的消息事件名。
 */
export const MESSAGE_METADATA = 'message';
/**
 * 网关服务器属性元数据键：标记类属性为注入的 WebSocket 服务器（@WebSocketServer）。
 */
export const GATEWAY_SERVER_METADATA = 'websockets:is_socket';
/**
 * 网关元数据键：标记一个类是 WebSocket 网关（@WebSocketGateway），
 * SocketModule 通过该键扫描并识别网关。
 */
export const GATEWAY_METADATA = 'websockets:is_gateway';
/**
 * 命名空间元数据键：由 @WebSocketGateway 的 namespace 参数写入。
 */
export const NAMESPACE_METADATA = 'namespace';
/**
 * 端口元数据键：由 @WebSocketGateway 的 port 参数写入。
 */
export const PORT_METADATA = 'port';
/**
 * 网关选项元数据键：存储 @WebSocketGateway 传入的适配器配置选项。
 */
export const GATEWAY_OPTIONS = 'websockets:gateway_options';
/**
 * 参数装饰器元数据键：与 HTTP 侧共用同一个键（ROUTE_ARGS_METADATA），
 * 用于存储 @ConnectedSocket、@MessageBody 等参数装饰器的元信息。
 */
export const PARAM_ARGS_METADATA = ROUTE_ARGS_METADATA;

/**
 * 连接事件名：客户端建立连接时由适配器触发（对应 socket.io 的 'connection'）。
 */
export const CONNECTION_EVENT = 'connection';
/**
 * 断开事件名：客户端断开连接时触发（对应 'disconnect'），调用 onGatewayDisconnect 钩子。
 */
export const DISCONNECT_EVENT = 'disconnect';
/**
 * 关闭事件名：服务器关闭时触发（对应 'close'）。
 */
export const CLOSE_EVENT = 'close';
/**
 * 错误事件名：发生错误时触发（对应 'error'）。
 */
export const ERROR_EVENT = 'error';
