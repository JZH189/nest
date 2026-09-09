import { TransportId } from './microservice-configuration.interface';

/**
 * 自定义传输策略接口：实现该接口即可接入任意第三方消息协议
 * （实现类通常同时继承 Server 基类以复用 handler 注册与分发能力）。
 * 通过 CustomStrategy 配置传给 createMicroservice() 后，
 * Nest 将调用 listen() 启动监听、close() 停止监听。
 *
 * @publicApi
 */
export interface CustomTransportStrategy {
  /**
   * 唯一的传输标识符（Transport 枚举值或自定义 Symbol）。
   */
  transportId?: TransportId;
  /**
   * Method called when the transport is being initialized.
   * @param callback Function to be called upon initialization
   */
  listen(callback: (...optionalParams: unknown[]) => any): any;
  /**
   * Method called when the transport is being terminated.
   */
  close(): any;
}
