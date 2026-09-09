/**
 * System signals which shut down a process
 *
 * 用于优雅停机（graceful shutdown）的系统信号枚举。
 * 通过 `app.enableShutdownHooks()` 启用后，Nest 会监听此处列出的信号，
 * 收到信号时先调用所有实现了 `OnApplicationShutdown` 接口的钩子，
 * 再退出进程。常用的如 SIGTERM（容器/进程管理器发出的终止信号）、
 * SIGINT（Ctrl+C）。
 */
export enum ShutdownSignal {
  SIGHUP = 'SIGHUP', // 终端挂起或控制进程终止
  SIGINT = 'SIGINT', // 键盘中断（Ctrl+C）
  SIGQUIT = 'SIGQUIT', // 键盘退出（Ctrl+\）
  SIGILL = 'SIGILL', // 非法指令
  SIGTRAP = 'SIGTRAP', // 跟踪/断点陷阱
  SIGABRT = 'SIGABRT', // 异常终止（abort）
  SIGBUS = 'SIGBUS', // 总线错误
  SIGFPE = 'SIGFPE', // 浮点异常
  SIGSEGV = 'SIGSEGV', // 段错误（非法内存访问）
  SIGUSR2 = 'SIGUSR2', // 用户自定义信号 2
  SIGTERM = 'SIGTERM', // 终止信号（kill 默认发送，容器停止时常用）
}
