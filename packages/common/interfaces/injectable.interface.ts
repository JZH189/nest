/**
 * 可注入对象的类型占位。真正的"可注入"语义由 `@Injectable()` 装饰器
 * 通过反射元数据标记，其实例由 IoC 容器解析和管理。
 */
export type Injectable = unknown;
