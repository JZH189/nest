/**
 * 构造函数类型别名：任何可被 new 调用并返回 T 实例的类构造器。
 */
export type Constructor<T> = new (...args: any[]) => T;

/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * 类装饰器工厂：将给定的键值对合并到被装饰类的原型上，
 * 并生成一个更具描述性的类名（原类名 + JSON 序列化的数据）。
 *
 * 典型用途是为现有类创建"预配置"变体：装饰后的类实例会自动
 * 携带 data 中的属性，且类名可读（如 "Foo{"id":1}"），便于调试与识别。
 *
 * @param data 要合并到类原型上的键值对集合
 * @returns 一个类装饰器函数
 */
export const MergeWithValues = <T extends Constructor<{}>>(data: {
  [param: string]: any;
}) => {
  return (Metatype: T): any => {
    // 1. 派生一个继承原类的新类，保持原有构造逻辑不变
    const Type = class extends Metatype {
      constructor(...args: any[]) {
        super(...args);
      }
    };
    // 2. 用"原类名 + 数据快照"作为新类名，使派生类可被区分和识别
    const token = Metatype.name + JSON.stringify(data);
    Object.defineProperty(Type, 'name', { value: token });
    // 3. 将配置数据直接挂到原型上，所有实例都会继承这些属性
    Object.assign(Type.prototype, data);
    return Type;
  };
};
