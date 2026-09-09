/**
 * Kafka 客户端连接状态。
 *
 * ClientKafka / ServerKafka 通过状态变更事件向外广播自身的连接状况，
 * 供上层做健康检查或联动处理（如状态码联动 / 健康指示器）。
 */
export const enum KafkaStatus {
  /** 已断开连接 */
  DISCONNECTED = 'disconnected',
  /** 已连接 */
  CONNECTED = 'connected',
  /** 客户端崩溃（如消费线程异常退出） */
  CRASHED = 'crashed',
  /** 已手动停止 */
  STOPPED = 'stopped',
  /** 消费者组正在 rebalance（分区重新分配中） */
  REBALANCING = 'rebalancing',
}
