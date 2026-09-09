/**
 * 混合应用（`app.connectMicroservice()`）的选项，
 * 控制微服务实例如何继承宿主 HTTP 应用的配置与初始化行为。
 *
 * @publicApi
 */
export interface NestHybridApplicationOptions {
  /**
   * 是否继承宿主应用的配置（如全局管道、拦截器、日志器等）。默认不继承。
   */
  inheritAppConfig?: boolean;
  /**
   * 是否延迟初始化微服务，直到显式调用 `startAllMicroservices()`（或 `listen()`）时才进行引导。
   */
  deferInitialization?: boolean;
}
