/**
 * 将普通对象转换为键值对 Map，常用于在测试中模拟消息处理程序的存储结构。
 */
export const objectToMap = (obj: Record<string, any>) =>
  new Map(Object.keys(obj).map(key => [key, obj[key]]) as any);
