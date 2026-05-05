/**
 * 用于配置关闭钩子行为的选项。
 *
 * @publicApi
 */
export interface ShutdownHooksOptions {
  /**
   * 如果为 true，在关闭钩子完成后使用 `process.exit()` 而不是 `process.kill(process.pid, signal)`。
   * 这确保 'exit' 事件被正确触发，这对于异步日志记录器（如带有 transports 的 Pino）
   * 在进程终止前刷新缓冲区是必需的。
   *
   * 注意：使用 `process.exit()` 会：
   * - 更改退出代码（例如，SIGTERM: 143 → 0）
   * - 可能不会触发第三方库的其他信号处理器
   * - 可能影响编排器（Kubernetes、Docker）行为
   *
   * @default false
   */
  useProcessExit?: boolean;
}
