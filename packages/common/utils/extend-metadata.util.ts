/**
 * 向目标（类/方法等）追加"数组型"元数据，是 Nest 装饰器体系的核心基础设施之一。
 * 装饰器（如 @UseGuards、@Get、Catch 等）通过它把新条目累积到已有元数据数组之后，
 * 而不是像 @SetMetadata 那样整体覆盖。
 *
 * @param key 元数据键（由各装饰器约定的常量，如 GUARDS_METADATA）
 * @param metadata 要追加的元数据数组
 * @param target 元数据挂载的目标（被装饰的类或方法）
 */
export function extendArrayMetadata<T extends Array<unknown>>(
  key: string,
  metadata: T,
  target: Function,
) {
  // 1. 读取目标上已有的元数据数组，没有则从空数组开始
  const previousValue = Reflect.getMetadata(key, target) || [];
  // 2. 合并旧值与新条目
  const value = [...previousValue, ...metadata];
  // 3. 将合并结果写回目标上对应的元数据键
  Reflect.defineMetadata(key, value, target);
}
