/**
 * 描述控制器的元数据（由 `@Controller()` 装饰器设置），
 * 在路由扫描阶段由核心包（core）中的 RoutesResolver 消费，用于解析路由路径。
 */
export interface ControllerMetadata {
  /** 控制器的路由路径前缀 */
  path?: string;
}
